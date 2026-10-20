import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { testRuns, testRunCases, testCases, testSuites } from "@/db/schema";
import { requireUser } from "@/lib/require-auth";
import { and, eq, inArray } from "drizzle-orm";

// Adds cases to an existing run (ones forgotten when it was created). Cases
// already in the run, or from another project, are skipped.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  const body = await req.json();
  const caseIds: string[] = Array.isArray(body.caseIds) ? body.caseIds : [];
  if (caseIds.length === 0) return NextResponse.json({ error: "Selecciona al menos un caso" }, { status: 400 });

  const run = await db.query.testRuns.findFirst({ where: eq(testRuns.id, id) });
  if (!run) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const projectCases = await db
    .select({ id: testCases.id })
    .from(testCases)
    .innerJoin(testSuites, eq(testCases.suiteId, testSuites.id))
    .where(and(eq(testSuites.projectId, run.projectId), inArray(testCases.id, caseIds)));
  const existing = await db
    .select({ caseId: testRunCases.caseId })
    .from(testRunCases)
    .where(eq(testRunCases.runId, id));
  const inRun = new Set(existing.map((e) => e.caseId));
  const toAdd = projectCases.map((c) => c.id).filter((caseId) => !inRun.has(caseId));

  if (toAdd.length > 0) {
    await db.insert(testRunCases).values(
      toAdd.map((caseId) => ({ runId: id, caseId, status: "untested" as const }))
    );
  }

  return NextResponse.json({ added: toAdd.length }, { status: 201 });
}
