import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { testCases, testSuites } from "@/db/schema";
import { requireUser } from "@/lib/require-auth";
import { normalizePriority, normalizeType, type ImportedCaseRow } from "@/lib/csv";
import { codeFormatError, normalizeCode } from "@/lib/case-code";
import { eq, and, inArray, isNotNull } from "drizzle-orm";

// Bulk import of test cases into a suite, e.g. from a CSV file.
// Reuses cases instead of duplicating them:
//  - a row whose code already belongs to a case in this suite updates that case
//  - a row whose code belongs to a case in another suite of the project is
//    skipped (codes are unique per project)
//  - a row whose title already matches a case in this suite updates it in place
//  - a row whose automationId already belongs to an automated case in another
//    suite of the same project is skipped (that's the case the Playwright
//    ingest endpoint will already be matching against — importing it again
//    here would just create a second case with the same automationId)
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { id: suiteId } = await ctx.params;

  const suite = await db.query.testSuites.findFirst({ where: eq(testSuites.id, suiteId) });
  if (!suite) return NextResponse.json({ error: "Suite no encontrada" }, { status: 404 });

  const body = await req.json();
  const rows: ImportedCaseRow[] = Array.isArray(body.cases) ? body.cases : [];
  if (rows.length === 0) {
    return NextResponse.json({ error: "No se recibieron casos para importar" }, { status: 400 });
  }

  const projectSuiteIds = (
    await db.query.testSuites.findMany({
      where: eq(testSuites.projectId, suite.projectId),
      columns: { id: true },
    })
  ).map((s) => s.id);

  const suiteCases = await db.query.testCases.findMany({ where: eq(testCases.suiteId, suiteId) });
  const byTitle = new Map(suiteCases.map((c) => [c.title.trim().toLowerCase(), c]));

  const casesElsewhere = await db.query.testCases.findMany({
    where: inArray(testCases.suiteId, projectSuiteIds.filter((s) => s !== suiteId)),
    columns: { code: true, title: true },
  });
  const codeElsewhere = new Map(
    casesElsewhere.filter((c) => c.code).map((c) => [c.code!.toUpperCase(), c.title])
  );
  const byCode = new Map(
    suiteCases.filter((c) => c.code).map((c) => [c.code!.toUpperCase(), c])
  );

  const automatedElsewhere = await db.query.testCases.findMany({
    where: and(
      inArray(testCases.suiteId, projectSuiteIds.filter((s) => s !== suiteId)),
      eq(testCases.automated, true),
      isNotNull(testCases.automationId)
    ),
    columns: { automationId: true, suiteId: true },
  });
  const automationIdElsewhere = new Set(automatedElsewhere.map((c) => c.automationId));

  const summary = {
    created: 0,
    updated: 0,
    skipped: [] as { title: string; reason: string }[],
  };

  for (const row of rows) {
    const title = (row.title || "").trim();
    if (!title) {
      summary.skipped.push({ title: "(sin título)", reason: "Fila sin título" });
      continue;
    }

    const code = normalizeCode(row.code);
    if (code) {
      const formatError = codeFormatError(code);
      if (formatError) {
        summary.skipped.push({ title, reason: formatError });
        continue;
      }
      if (codeElsewhere.has(code)) {
        summary.skipped.push({
          title,
          reason: `El código ${code} ya lo usa "${codeElsewhere.get(code)}" en otra suite de este proyecto`,
        });
        continue;
      }
    }

    const automationId = row.automationId?.trim() || null;
    if (automationId && automationIdElsewhere.has(automationId)) {
      summary.skipped.push({
        title,
        reason: `Ya existe un caso automatizado con el id "${automationId}" en otra suite de este proyecto`,
      });
      continue;
    }

    const payload = {
      ...(code ? { code } : {}),
      title,
      preconditions: row.preconditions?.trim() || null,
      steps: JSON.stringify(row.steps || []),
      priority: normalizePriority(row.priority),
      type: normalizeType(row.type),
      tags: row.tags?.trim() || "",
      automated: !!row.automated,
      automationId,
    };

    const key = title.toLowerCase();
    const existing = (code && byCode.get(code)) || byTitle.get(key);
    if (existing) {
      if (code && byCode.has(code) && byCode.get(code)!.id !== existing.id) {
        summary.skipped.push({ title, reason: `El código ${code} ya lo usa otro caso de esta suite` });
        continue;
      }
      await db.update(testCases).set(payload).where(eq(testCases.id, existing.id));
      if (code) byCode.set(code, { ...existing, code });
      summary.updated++;
      continue;
    }
    if (code && byCode.has(code)) {
      summary.skipped.push({ title, reason: `El código ${code} ya lo usa otro caso de esta suite` });
      continue;
    }

    const [created] = await db
      .insert(testCases)
      .values({ suiteId, ...payload, createdBy: user!.id })
      .returning();
    byTitle.set(key, created);
    if (code) byCode.set(code, created);
    summary.created++;
  }

  return NextResponse.json(summary, { status: 201 });
}
