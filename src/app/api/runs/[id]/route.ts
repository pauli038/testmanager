import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { testRuns, testRunCases, testCases, users, attachments, defects } from "@/db/schema";
import { requireUser } from "@/lib/require-auth";
import { eq } from "drizzle-orm";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;

  const run = await db.query.testRuns.findFirst({ where: eq(testRuns.id, id) });
  if (!run) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const runCases = await db
    .select({
      id: testRunCases.id,
      status: testRunCases.status,
      comment: testRunCases.comment,
      executedAt: testRunCases.executedAt,
      durationMs: testRunCases.durationMs,
      errorMessage: testRunCases.errorMessage,
      executedByName: users.name,
      caseId: testCases.id,
      caseTitle: testCases.title,
      caseSteps: testCases.steps,
      casePreconditions: testCases.preconditions,
      casePriority: testCases.priority,
      caseAutomated: testCases.automated,
    })
    .from(testRunCases)
    .innerJoin(testCases, eq(testRunCases.caseId, testCases.id))
    .leftJoin(users, eq(testRunCases.executedBy, users.id))
    .where(eq(testRunCases.runId, id));

  const runCaseIds = runCases.map((rc) => rc.id);
  const allAttachments = runCaseIds.length
    ? await db.query.attachments.findMany({
        where: (a, { inArray }) => inArray(a.runCaseId, runCaseIds),
      })
    : [];
  const allDefects = runCaseIds.length
    ? await db.query.defects.findMany({
        where: (d, { inArray }) => inArray(d.runCaseId, runCaseIds),
      })
    : [];

  const result = runCases.map((rc) => ({
    ...rc,
    attachments: allAttachments
      .filter((a) => a.runCaseId === rc.id)
      .map((a) => ({
        id: a.id,
        filename: a.filename,
        url: `data:${a.mimeType};base64,${a.data}`,
      })),
    defects: allDefects.filter((d) => d.runCaseId === rc.id),
  }));

  return NextResponse.json({ run, runCases: result });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  const body = await req.json();

  const [updated] = await db
    .update(testRuns)
    .set({
      status: body.status,
      completedAt: body.status === "completed" ? new Date().toISOString() : undefined,
    })
    .where(eq(testRuns.id, id))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  await db.delete(testRuns).where(eq(testRuns.id, id));
  return NextResponse.json({ ok: true });
}
