import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  apiKeys,
  testRuns,
  testRunCases,
  testSuites,
  testCases,
  attachments,
} from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { extractCodes, caseCodes, mentionsCode, normalizeTitle } from "@/lib/case-matching";

// Playwright integration endpoint.
// Auth: header "x-api-key: tm_xxx" (create one in Project > Settings > API Keys)
//
// Body shape:
// {
//   "runName": "Regression Run #15",          // optional
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
export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) {
    return NextResponse.json({ error: "Falta el header x-api-key" }, { status: 401 });
  }

  const keyRecord = await db.query.apiKeys.findFirst({ where: eq(apiKeys.key, apiKey) });
  if (!keyRecord) {
    return NextResponse.json({ error: "API key inválida" }, { status: 401 });
  }

  const body = await req.json();
  const results: Array<{
    automationId: string;
    title?: string;
    status: "passed" | "failed" | "skipped";
    durationMs?: number;
    errorMessage?: string;
    screenshotBase64?: string;
  }> = body.results || [];

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

  const created = [];
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
    }

    const [runCase] = await db
      .insert(testRunCases)
      .values({
        runId: run.id,
        caseId: testCase.id,
        status: r.status,
        executedAt: new Date().toISOString(),
        durationMs: r.durationMs || null,
        errorMessage: r.errorMessage || null,
        comment: "Resultado enviado automáticamente por Playwright",
      })
      .returning();

    if (r.screenshotBase64) {
      try {
        await db.insert(attachments).values({
          runCaseId: runCase.id,
          filename: `${r.automationId}.png`,
          data: r.screenshotBase64,
          mimeType: "image/png",
        });
      } catch {
        // ignore attachment errors, don't fail the whole ingest
      }
    }

    created.push({ automationId: r.automationId, status: r.status, runCaseId: runCase.id });
  }

  return NextResponse.json({ runId: run.id, results: created }, { status: 201 });
}
