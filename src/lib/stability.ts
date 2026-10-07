import { db } from "@/db";
import { defects, defectTestCases, testCases, testRunCases, testRuns, testSuites } from "@/db/schema";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import {
  STABILITY_WINDOW,
  classify,
  isFail,
  type CaseStability,
  type HistoryPoint,
  type RunOutcome,
  type StabilityData,
} from "@/lib/stability-shared";
import { stripAnsi } from "@/lib/ansi";

export * from "@/lib/stability-shared";


// When a run has several results for the same case (e.g. a parametrized
// Playwright test sends one per variant), the run counts as its worst one.
const SEVERITY: Record<RunOutcome, number> = { skipped: 0, passed: 1, blocked: 2, failed: 3 };

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export async function getStabilityData(projectId: string): Promise<StabilityData> {
  const suites = await db.query.testSuites.findMany({
    where: eq(testSuites.projectId, projectId),
    columns: { id: true, name: true },
  });
  if (suites.length === 0) return { cases: [], slow: [] };
  const suiteName = new Map(suites.map((s) => [s.id, s.name]));

  const rows = await db
    .select({
      caseId: testRunCases.caseId,
      runId: testRunCases.runId,
      runName: testRuns.name,
      status: testRunCases.status,
      executedAt: testRunCases.executedAt,
      durationMs: testRunCases.durationMs,
      errorMessage: testRunCases.errorMessage,
      code: testCases.code,
      title: testCases.title,
      suiteId: testCases.suiteId,
      automated: testCases.automated,
    })
    .from(testRunCases)
    .innerJoin(testCases, eq(testRunCases.caseId, testCases.id))
    .innerJoin(testRuns, eq(testRunCases.runId, testRuns.id))
    .where(
      and(
        inArray(
          testCases.suiteId,
          suites.map((s) => s.id)
        ),
        ne(testRunCases.status, "untested"),
        sql`${testRunCases.executedAt} is not null`
      )
    )
    .orderBy(testRunCases.caseId, testRunCases.executedAt);

  const defectLinks = await db
    .select({ caseId: defectTestCases.caseId })
    .from(defectTestCases)
    .innerJoin(defects, eq(defectTestCases.defectId, defects.id))
    .where(and(eq(defects.projectId, projectId), ne(defects.status, "closed")));
  const openDefectsByCase = new Map<string, number>();
  for (const { caseId } of defectLinks) {
    openDefectsByCase.set(caseId, (openDefectsByCase.get(caseId) ?? 0) + 1);
  }

  const byCase = new Map<string, typeof rows>();
  for (const r of rows) byCase.set(r.caseId, [...(byCase.get(r.caseId) ?? []), r]);

  const cases: CaseStability[] = [];
  for (const [caseId, list] of byCase) {
    // Collapse to one outcome per run, in the order the runs happened.
    const perRun = new Map<string, HistoryPoint & { durations: number[]; error: string | null }>();
    for (const r of list) {
      const status = r.status as RunOutcome;
      const prev = perRun.get(r.runId);
      if (!prev) {
        perRun.set(r.runId, {
          runId: r.runId,
          runName: r.runName,
          status,
          executedAt: r.executedAt!,
          durations: r.durationMs != null ? [r.durationMs] : [],
          error: isFail(status) ? r.errorMessage : null,
        });
        continue;
      }
      if (SEVERITY[status] > SEVERITY[prev.status]) {
        prev.status = status;
        if (isFail(status)) prev.error = r.errorMessage ?? prev.error;
      }
      if (r.executedAt! > prev.executedAt) prev.executedAt = r.executedAt!;
      if (r.durationMs != null) prev.durations.push(r.durationMs);
    }
    const runs = [...perRun.values()].sort((a, b) => (a.executedAt < b.executedAt ? -1 : 1));
    const window = runs.slice(-STABILITY_WINDOW);
    const { category, flips, failStreak, passRate } = classify(window.map((h) => h.status));
    const lastFailed = [...runs].reverse().find((h) => isFail(h.status));
    const first = list[0];
    const lastError = lastFailed?.error ? stripAnsi(lastFailed.error).slice(0, 2000) : null;
    const openDefects = openDefectsByCase.get(caseId) ?? 0;

    cases.push({
      id: caseId,
      code: first.code,
      title: first.title,
      suiteName: suiteName.get(first.suiteId) ?? "",
      automated: first.automated,
      category,
      history: window.map(({ runId, runName, status, executedAt }) => ({
        runId,
        runName,
        status,
        executedAt,
      })),
      executions: runs.length,
      passRate,
      flips,
      failStreak,
      medianDurationMs: median(window.flatMap((h) => h.durations)),
      lastError,
      openDefects,
      knownDefect: openDefects > 0 || /\bDEFECTO\b/i.test(lastError ?? ""),
      lastFailure: lastFailed
        ? { runId: lastFailed.runId, runName: lastFailed.runName, executedAt: lastFailed.executedAt }
        : null,
    });
  }

  // Worst first inside each category.
  cases.sort(
    (a, b) => b.failStreak - a.failStreak || b.flips - a.flips || a.passRate - b.passRate
  );
  const slow = cases
    .filter((c) => c.automated && c.medianDurationMs != null)
    .sort((a, b) => b.medianDurationMs! - a.medianDurationMs!)
    .slice(0, 15);

  return { cases, slow };
}
