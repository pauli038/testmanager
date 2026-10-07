import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { testRuns, testRunCases, testSuites, testCases, attachments, projects } from "@/db/schema";
import { eq, and, inArray, ne } from "drizzle-orm";
import { extractCodes, caseCodes, mentionsCode, normalizeTitle } from "@/lib/case-matching";
import { requireApiKey } from "@/lib/api-key";

type Outcome = "passed" | "failed" | "skipped";
type IngestResult = {
  automationId: string;
  title?: string;
  status: Outcome;
  durationMs?: number;
  errorMessage?: string;
  screenshotBase64?: string;
};

// When several results of one batch land on the same case (a parametrized
// test sends one per variant), the case gets a single result: the worst one.
const SEVERITY: Record<Outcome, number> = { skipped: 0, passed: 1, failed: 2 };

// Only http(s) links are stored, so a CI URL can never become a script link.
function cleanUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  try {
    const u = new URL(v.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString().slice(0, 500) : null;
  } catch {
    return null;
  }
}
const cleanText = (v: unknown, max: number) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

// Playwright integration endpoint.
// Auth: header "x-api-key: tm_xxx" (create one in Project > Settings > API Keys)
//
// Body shape:
// {
//   "runName": "Regression Run #15",          // optional
//   "ci": {                                    // optional: where the run came from
//     "url": "https://github.com/org/repo/actions/runs/123",
//     "branch": "main",
//     "commit": "a1b2c3d"
//   },
//   "results": [
//     {
//       "automationId": "LoginTest",           // matches a test case's automationId, or created automatically
//       "title": "should log in with valid credentials",
//       "status": "passed" | "failed" | "skipped",
//       "durationMs": 1234,
//       "errorMessage": "...",                 // optional, for failed tests
//       "screenshotBase64": "..."               // optional, PNG base64
//     }
//   ]
// }
//
// Response: { runId, results: [{ automationId, status, runCaseId }], warnings }
// with results in the same order as the request (variants grouped on one case
// share their runCaseId). "warnings" flags things that look off, e.g. results
// that seem to belong to another project (wrong API key). Videos and traces
// are uploaded afterwards to /api/ingest/attachments with the runCaseId.
export async function POST(req: NextRequest) {
  const { projectId, error } = await requireApiKey(req);
  if (error) return error;
  const keyRecord = { projectId };

  const body = await req.json();
  const results: IngestResult[] = body.results || [];

  if (!Array.isArray(results) || results.length === 0) {
    return NextResponse.json({ error: "results vacío" }, { status: 400 });
  }

  // Ensure there's a suite to hold auto-discovered automated cases.
  let autoSuite = await db.query.testSuites.findFirst({
    where: and(
      eq(testSuites.projectId, keyRecord.projectId),
      eq(testSuites.name, "Automatizado (Playwright)")
    ),
  });
  if (!autoSuite) {
    [autoSuite] = await db
      .insert(testSuites)
      .values({
        projectId: keyRecord.projectId,
        name: "Automatizado (Playwright)",
        description: "Casos descubiertos automáticamente desde resultados de Playwright.",
      })
      .returning();
  }

  const [run] = await db
    .insert(testRuns)
    .values({
      projectId: keyRecord.projectId,
      name: body.runName || `Playwright Run · ${new Date().toLocaleString("es-CR")}`,
      source: "playwright",
      status: "completed",
      completedAt: new Date().toISOString(),
      ciUrl: cleanUrl(body.ci?.url),
      branch: cleanText(body.ci?.branch, 200),
      commitSha: cleanText(body.ci?.commit, 64),
    })
    .returning();

  // Cases must belong to this project — otherwise an automationId shared with
  // another project's case could match the wrong one. Loaded once and kept in
  // sync below, so results later in the same batch see cases linked or
  // created by earlier ones.
  const projectSuiteIds = (
    await db.query.testSuites.findMany({
      where: eq(testSuites.projectId, keyRecord.projectId),
      columns: { id: true },
    })
  ).map((s) => s.id);
  const projectCases = await db.query.testCases.findMany({
    where: inArray(testCases.suiteId, projectSuiteIds),
  });
  type Case = (typeof projectCases)[number];

  // Among several candidates, a case written by hand in its real suite beats
  // one auto-created in "Automatizado (Playwright)". Still ambiguous → none.
  const pickOne = (candidates: Case[]): Case | undefined => {
    if (candidates.length === 1) return candidates[0];
    const real = candidates.filter((c) => c.suiteId !== autoSuite.id);
    return real.length === 1 ? real[0] : undefined;
  };

  const linkCase = async (c: Case, automationId: string): Promise<Case> => {
    // Keep an existing automationId: several Playwright tests may feed the
    // same case (e.g. an e2e test and a unit test), matched by code.
    if (c.automated && c.automationId) return c;
    const [updated] = await db
      .update(testCases)
      .set({ automated: true, automationId: c.automationId ?? automationId })
      .where(eq(testCases.id, c.id))
      .returning();
    projectCases[projectCases.indexOf(c)] = updated;
    return updated;
  };

  // 1) Find (or create) the case each result belongs to.
  const caseIdByIndex: string[] = [];
  const createdCases: Case[] = [];
  for (const r of results) {
    const shortTitle = r.title || r.automationId;

    // 1) Match by the full titlePath (recommended, set via automationId) or
    // by the test's short title — some users paste the short title instead.
    // Restricted to cases already marked automated, so a Playwright result
    // never latches onto an unrelated manual case with the same text.
    let testCase = projectCases.find(
      (c) => c.automated && (c.automationId === r.automationId || c.automationId === shortTitle)
    );

    // 2) Match by the case's code field: a test whose title/titlePath mentions
    // "TC-RF020-06" (or whatever code the case has) feeds that case. When
    // several codes are mentioned, the longest one wins, so "TC-RF020-06"
    // beats a hypothetical "TC-RF020".
    if (!testCase) {
      const text = `${r.automationId} ${shortTitle}`;
      const byCode = projectCases
        .filter((c) => c.code && mentionsCode(text, c.code))
        .sort((a, b) => b.code!.length - a.code!.length);
      const longest = byCode.filter((c) => c.code!.length === byCode[0]?.code!.length);
      const match = pickOne(longest);
      if (match) testCase = await linkCase(match, r.automationId);
    }

    // 3) Match by codes in tags/automationId/title: "TC-RF020-06 …" or
    // "… (RN-044)" in the test links to the case that has that code there.
    // TC codes identify a single case, so they're tried before RN (business
    // rule) codes.
    if (!testCase) {
      const codes = extractCodes(`${r.automationId} ${shortTitle}`);
      for (const tier of [codes.filter((c) => c.startsWith("TC-")), codes]) {
        if (tier.length === 0) continue;
        const match = pickOne(projectCases.filter((c) => tier.some((code) => caseCodes(c).has(code))));
        if (match) {
          testCase = await linkCase(match, r.automationId);
          break;
        }
      }
    }

    // 4) No case has that automationId or code yet — but if there's already a
    // case with the same title (ignoring case, accents, punctuation and test
    // codes) sitting in its real suite (created by hand, automationId never
    // filled in), reuse it instead of creating a duplicate in "Automatizado
    // (Playwright)". Mark it automated and backfill its automationId so
    // future runs match directly via automationId.
    const normalizedTitle = normalizeTitle(shortTitle);
    if (!testCase && normalizedTitle) {
      const match = pickOne(
        projectCases.filter((c) => !c.automationId && normalizeTitle(c.title) === normalizedTitle)
      );
      if (match) testCase = await linkCase(match, r.automationId);
    }

    if (!testCase) {
      [testCase] = await db
        .insert(testCases)
        .values({
          suiteId: autoSuite.id,
          title: shortTitle,
          steps: "[]",
          automated: true,
          automationId: r.automationId,
        })
        .returning();
      projectCases.push(testCase);
      createdCases.push(testCase);
    }
    caseIdByIndex.push(testCase.id);
  }

  // 2) One result per case: variants of a parametrized test are grouped.
  const indexesByCase = new Map<string, number[]>();
  caseIdByIndex.forEach((caseId, i) =>
    indexesByCase.set(caseId, [...(indexesByCase.get(caseId) ?? []), i])
  );

  const variantName = (r: IngestResult) => r.title || r.automationId;
  const runCaseIdByCase = new Map<string, string>();
  for (const [caseId, indexes] of indexesByCase) {
    const group = indexes.map((i) => results[i]);
    const status = group.reduce<Outcome>(
      (worst, r) => (SEVERITY[r.status] > SEVERITY[worst] ? r.status : worst),
      group[0].status
    );
    const failed = group.filter((r) => r.status === "failed" && r.errorMessage);
    const errorMessage =
      group.length === 1
        ? group[0].errorMessage || null
        : failed.map((r) => `▸ ${variantName(r)}\n${r.errorMessage}`).join("\n\n") || null;
    const count = (o: Outcome) => group.filter((r) => r.status === o).length;
    const summary = [
      count("passed") && `${count("passed")} aprobadas`,
      count("failed") && `${count("failed")} fallidas`,
      count("skipped") && `${count("skipped")} omitidas`,
    ]
      .filter(Boolean)
      .join(", ");
    const comment =
      group.length === 1
        ? "Resultado enviado automáticamente por Playwright"
        : `Resultado enviado automáticamente por Playwright: ${group.length} variantes (${summary})`;
    const durations = group
      .map((r) => r.durationMs)
      .filter((d): d is number => typeof d === "number");

    const [runCase] = await db
      .insert(testRunCases)
      .values({
        runId: run.id,
        caseId,
        status,
        executedAt: new Date().toISOString(),
        durationMs: durations.length ? durations.reduce((a, b) => a + b, 0) : null,
        errorMessage,
        comment,
      })
      .returning();
    runCaseIdByCase.set(caseId, runCase.id);

    for (const r of group) {
      if (!r.screenshotBase64) continue;
      try {
        await db.insert(attachments).values({
          runCaseId: runCase.id,
          filename: `${variantName(r).replace(/[^\w.-]+/g, "_").slice(0, 120)}.png`,
          data: r.screenshotBase64,
          mimeType: "image/png",
        });
      } catch {
        // ignore attachment errors, don't fail the whole ingest
      }
    }
  }

  // 3) New cases that look like another project's (same code or automation
  // id) usually mean the reporter used the wrong project's API key.
  const warnings: string[] = [];
  if (createdCases.length) {
    const others = await db
      .select({
        code: testCases.code,
        automationId: testCases.automationId,
        projectName: projects.name,
      })
      .from(testCases)
      .innerJoin(testSuites, eq(testCases.suiteId, testSuites.id))
      .innerJoin(projects, eq(testSuites.projectId, projects.id))
      .where(ne(testSuites.projectId, keyRecord.projectId));
    const hits = new Map<string, number>();
    for (const c of createdCases) {
      const text = `${c.automationId ?? ""} ${c.title}`;
      const other = others.find(
        (o) =>
          (o.automationId && o.automationId === c.automationId) ||
          (o.code && mentionsCode(text, o.code))
      );
      if (other) hits.set(other.projectName, (hits.get(other.projectName) ?? 0) + 1);
    }
    for (const [name, n] of hits) {
      warnings.push(
        `${n} caso(s) nuevo(s) coinciden con casos del proyecto "${name}". ¿Usaste la API key correcta?`
      );
    }
  }

  return NextResponse.json(
    {
      runId: run.id,
      results: results.map((r, i) => ({
        automationId: r.automationId,
        status: r.status,
        runCaseId: runCaseIdByCase.get(caseIdByIndex[i])!,
      })),
      warnings,
    },
    { status: 201 }
  );
}
