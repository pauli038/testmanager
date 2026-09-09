import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { defects, defectTestCases } from "@/db/schema";
import { requireUser } from "@/lib/require-auth";
import { eq } from "drizzle-orm";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  const body = await req.json();

  const [updated] = await db
    .update(defects)
    .set({
      title: body.title,
      description: body.description,
      severity: body.severity,
      status: body.status,
      stepsToReproduce: body.stepsToReproduce ? JSON.stringify(body.stepsToReproduce) : undefined,
      module: "module" in body ? body.module || null : undefined,
      environment: "environment" in body ? body.environment || null : undefined,
      detectedAt: "detectedAt" in body ? body.detectedAt || null : undefined,
      retests: body.retests ? JSON.stringify(body.retests) : undefined,
    })
    .where(eq(defects.id, id))
    .returning();

  if (Array.isArray(body.caseIds)) {
    await db.delete(defectTestCases).where(eq(defectTestCases.defectId, id));
    if (body.caseIds.length) {
      await db
        .insert(defectTestCases)
        .values(body.caseIds.map((caseId: string) => ({ defectId: id, caseId })));
    }
  }
  const linked = await db.query.defectTestCases.findMany({
    where: eq(defectTestCases.defectId, id),
    with: { case: { columns: { id: true, title: true } } },
  });
  const cases = linked.map((l) => l.case);

  return NextResponse.json({ ...updated, cases });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  await db.delete(defects).where(eq(defects.id, id));
  return NextResponse.json({ ok: true });
}
