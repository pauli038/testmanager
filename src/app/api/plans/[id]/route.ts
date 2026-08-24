import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { testPlans, testPlanSuites, testSuites } from "@/db/schema";
import { requireUser } from "@/lib/require-auth";
import { eq, inArray } from "drizzle-orm";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  const body = await req.json();
  const suiteIds: string[] = body.suiteIds || [];

  const [updated] = await db
    .update(testPlans)
    .set({
      name: body.name,
      description: body.description,
    })
    .where(eq(testPlans.id, id))
    .returning();

  await db.delete(testPlanSuites).where(eq(testPlanSuites.planId, id));
  let suites: { id: string; name: string }[] = [];
  if (suiteIds.length > 0) {
    await db.insert(testPlanSuites).values(
      suiteIds.map((suiteId) => ({ planId: id, suiteId }))
    );
    suites = await db.query.testSuites.findMany({
      where: inArray(testSuites.id, suiteIds),
      columns: { id: true, name: true },
    });
  }

  return NextResponse.json({ ...updated, suites });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  await db.delete(testPlans).where(eq(testPlans.id, id));
  return NextResponse.json({ ok: true });
}
