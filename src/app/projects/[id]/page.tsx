import { db } from "@/db";
import { testRuns, testRunCases, testCases, testSuites, defects } from "@/db/schema";
import { eq, sql, inArray } from "drizzle-orm";
import DashboardCharts from "@/components/DashboardCharts";

export default async function ProjectDashboard(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  const suites = await db.query.testSuites.findMany({ where: eq(testSuites.projectId, id) });
  const suiteIds = suites.map((s) => s.id);
  const caseCountRes = suiteIds.length
    ? await db
        .select({ count: sql<number>`count(*)` })
        .from(testCases)
        .where(inArray(testCases.suiteId, suiteIds))
    : [{ count: 0 }];

  const runs = await db.query.testRuns.findMany({
    where: eq(testRuns.projectId, id),
    orderBy: (r, { desc }) => [desc(r.createdAt)],
    limit: 10,
  });

  const runTrend = await Promise.all(
    runs
      .slice()
      .reverse()
      .map(async (r) => {
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
        return {
          name: r.name.length > 18 ? r.name.slice(0, 18) + "…" : r.name,
          passRate: total > 0 ? Math.round((stats.passed / total) * 100) : 0,
          ...stats,
          total,
        };
      })
  );

  const overallRows = runs.length
    ? await db
        .select({ status: testRunCases.status, count: sql<number>`count(*)` })
        .from(testRunCases)
        .where(
          inArray(
            testRunCases.runId,
            runs.map((r) => r.id)
          )
        )
        .groupBy(testRunCases.status)
    : [];
  const overallStats: Record<string, number> = {
    untested: 0,
    passed: 0,
    failed: 0,
    blocked: 0,
    skipped: 0,
  };
  for (const row of overallRows) overallStats[row.status] = row.count;

  const defectRows = await db
    .select({ status: defects.status, count: sql<number>`count(*)` })
    .from(defects)
    .where(eq(defects.projectId, id))
    .groupBy(defects.status);
  const defectStats: Record<string, number> = { open: 0, in_progress: 0, closed: 0 };
  for (const row of defectRows) defectStats[row.status] = row.count;

  return (
    <DashboardCharts
      totalCases={caseCountRes[0]?.count ?? 0}
      totalRuns={runs.length}
      overallStats={overallStats}
      runTrend={runTrend}
      defectStats={defectStats}
    />
  );
}
