import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { testRuns, testRunCases } from "@/db/schema";
import { requireUser } from "@/lib/require-auth";
import { eq, sql } from "drizzle-orm";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  const runs = await db.query.testRuns.findMany({
    where: eq(testRuns.projectId, id),
    orderBy: (r, { desc }) => [desc(r.createdAt)],
  });

  const withStats = await Promise.all(
    runs.map(async (r) => {
      const rows = await db
        .select({ status: testRunCases.status, count: sql<number>`count(*)` })
        .from(testRunCases)
        .where(eq(testRunCases.runId, r.id))
        .groupBy(testRunCases.status);
      const stats: Record<string, number> = {
        untested: 0,
        passed: 0,
        failed: 0,
        blocked: 0,
        skipped: 0,
      };
      for (const row of rows) stats[row.status] = row.count;
      const total = Object.values(stats).reduce((a, b) => a + b, 0);
      return { ...r, stats, total };
    })
  );

  return NextResponse.json(withStats);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  const body = await req.json();
  if (!body.name) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
  const caseIds: string[] = body.caseIds || [];

  const [run] = await db
    .insert(testRuns)
    .values({
      projectId: id,
      planId: body.planId || null,
      name: body.name,
      source: "manual",
      createdBy: user!.id,
    })
    .returning();

  if (caseIds.length > 0) {
    await db.insert(testRunCases).values(
      caseIds.map((caseId) => ({
        runId: run.id,
        caseId,
        status: "untested" as const,
      }))
    );
  }

  return NextResponse.json(run, { status: 201 });
}
