import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { testPlans, testPlanSuites, testSuites } from "@/db/schema";
import { requireUser } from "@/lib/require-auth";
import { eq, inArray } from "drizzle-orm";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  const plans = await db.query.testPlans.findMany({
    where: eq(testPlans.projectId, id),
    orderBy: (p, { desc }) => [desc(p.createdAt)],
    with: { planSuites: { with: { suite: true } } },
  });
  const withSuites = plans.map(({ planSuites, ...p }) => ({
    ...p,
    suites: planSuites.map((ps) => ({ id: ps.suite.id, name: ps.suite.name })),
  }));
  return NextResponse.json(withSuites);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  const body = await req.json();
  if (!body.name) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
  const suiteIds: string[] = body.suiteIds || [];

  const [plan] = await db
    .insert(testPlans)
    .values({
      projectId: id,
      name: body.name,
      description: body.description || null,
      createdBy: user!.id,
    })
    .returning();

  let suites: { id: string; name: string }[] = [];
  if (suiteIds.length > 0) {
    await db.insert(testPlanSuites).values(
      suiteIds.map((suiteId) => ({ planId: plan.id, suiteId }))
    );
    suites = await db.query.testSuites.findMany({
      where: inArray(testSuites.id, suiteIds),
      columns: { id: true, name: true },
    });
  }

  return NextResponse.json({ ...plan, suites }, { status: 201 });
}
