import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { caseKanbanColumns, testCases, testSuites } from "@/db/schema";
import { requireUser } from "@/lib/require-auth";
import { eq, and, asc, inArray } from "drizzle-orm";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  const body = await req.json();

  const updates: Partial<typeof caseKanbanColumns.$inferInsert> = {};
  if (body.label !== undefined) updates.label = body.label;
  if (body.color !== undefined) updates.color = body.color;
  if (body.position !== undefined) updates.position = body.position;

  const [updated] = await db
    .update(caseKanbanColumns)
    .set(updates)
    .where(eq(caseKanbanColumns.id, id))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;

  const column = await db.query.caseKanbanColumns.findFirst({
    where: eq(caseKanbanColumns.id, id),
  });
  if (!column) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const siblings = await db.query.caseKanbanColumns.findMany({
    where: eq(caseKanbanColumns.projectId, column.projectId),
    orderBy: [asc(caseKanbanColumns.position)],
  });
  const fallback = siblings.find((c) => c.id !== id);

  const projectCaseIds = (
    await db
      .select({ caseId: testCases.id })
      .from(testCases)
      .innerJoin(testSuites, eq(testCases.suiteId, testSuites.id))
      .where(and(eq(testSuites.projectId, column.projectId), eq(testCases.phase, column.key)))
  ).map((r) => r.caseId);

  if (projectCaseIds.length > 0) {
    await db
      .update(testCases)
      .set({ phase: fallback?.key ?? null })
      .where(inArray(testCases.id, projectCaseIds));
  }

  await db.delete(caseKanbanColumns).where(eq(caseKanbanColumns.id, id));

  return NextResponse.json({ ok: true });
}
