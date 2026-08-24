import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { defects, testCases } from "@/db/schema";
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
      caseId: "caseId" in body ? body.caseId || null : undefined,
      stepsToReproduce: body.stepsToReproduce ? JSON.stringify(body.stepsToReproduce) : undefined,
      module: "module" in body ? body.module || null : undefined,
      environment: "environment" in body ? body.environment || null : undefined,
      detectedAt: "detectedAt" in body ? body.detectedAt || null : undefined,
    })
    .where(eq(defects.id, id))
    .returning();

  const relatedCase = updated.caseId
    ? await db.query.testCases.findFirst({
        where: eq(testCases.id, updated.caseId),
        columns: { id: true, title: true },
      })
    : null;

  return NextResponse.json({ ...updated, case: relatedCase || null });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  await db.delete(defects).where(eq(defects.id, id));
  return NextResponse.json({ ok: true });
}
