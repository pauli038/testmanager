import { db } from "@/db";
import { testRuns, testRunCases, testCases, testSuites, defects, users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import type { DashboardData, Status, StatusCounts } from "@/components/DashboardCharts";

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVITY_DAYS = 14;
const MAX_BURNDOWN_DAYS = 60;
const LATEST_RESULTS = 120;
const PROGRESS_DAYS = 30;

// Timestamps are stored as text (ISO strings or Postgres `now()` output);
// the first 10 chars are always the YYYY-MM-DD day.
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS);
const parseDay = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`);

// Percentage with one decimal.
const pct1 = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);

function emptyCounts(): StatusCounts {
  return { untested: 0, passed: 0, failed: 0, blocked: 0, skipped: 0 };
}

export async function getDashboardData(id: string): Promise<DashboardData> {
  const [caseCountRes, runs, rows, defectRows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(testCases)
      .innerJoin(testSuites, eq(testCases.suiteId, testSuites.id))
      .where(eq(testSuites.projectId, id)),
    db.query.testRuns.findMany({
      where: eq(testRuns.projectId, id),
      orderBy: (r, { desc }) => [desc(r.createdAt)],
    }),
    db
      .select({
        runId: testRunCases.runId,
        caseId: testRunCases.caseId,
        status: testRunCases.status,
        executedAt: testRunCases.executedAt,
        executedBy: testRunCases.executedBy,
        executorName: users.name,
      })
      .from(testRunCases)
      .innerJoin(testRuns, eq(testRunCases.runId, testRuns.id))
      .leftJoin(users, eq(testRunCases.executedBy, users.id))
      .where(eq(testRuns.projectId, id)),
    db
      .select({ status: defects.status, createdAt: defects.createdAt })
      .from(defects)
      .where(eq(defects.projectId, id)),
  ]);

  const today = parseDay(dayKey(new Date()));
  const todayKey = dayKey(today);
  const executed = rows.filter((r) => r.status !== "untested" && r.executedAt);

  // ---------- Active runs ----------
  const activeRuns = runs.filter((r) => r.status === "active");
  const activeIds = new Set(activeRuns.map((r) => r.id));
  const activeRows = rows.filter((r) => activeIds.has(r.runId));
  const activePending = activeRows.filter((r) => r.status === "untested").length;

  const activeRunList = activeRuns.map((run) => {
    const runRows = activeRows.filter((r) => r.runId === run.id);
    const counts = emptyCounts();
    const contributors = new Map<string, string>();
    for (const r of runRows) {
      counts[r.status]++;
      if (r.executedBy && r.status !== "untested") {
        contributors.set(r.executedBy, r.executorName || "?");
      }
    }
    return {
      id: run.id,
      name: run.name,
      total: runRows.length,
      counts,
      contributors: [...contributors.values()],
    };
  });
  const notStarted = activeRunList.filter((r) => r.counts.untested === r.total).length;
  const activeContributors = new Set(
    activeRows.filter((r) => r.executedBy && r.status !== "untested").map((r) => r.executedBy)
  ).size;

  // ---------- Burndown for active runs ----------
  let burndown: DashboardData["burndown"] = null;
  if (activeRows.length > 0) {
    const firstRunDay = activeRuns
      .map((r) => parseDay(r.createdAt))
      .reduce((a, b) => (a < b ? a : b));
    const start = new Date(
      Math.max(firstRunDay.getTime(), addDays(today, -(MAX_BURNDOWN_DAYS - 1)).getTime())
    );
    const startKey = dayKey(start);
    const total = activeRows.length;

    const perDay = new Map<string, number>();
    let doneBeforeStart = 0;
    for (const r of activeRows) {
      if (r.status === "untested" || !r.executedAt) continue;
      const k = r.executedAt.slice(0, 10);
      if (k < startKey) doneBeforeStart++;
      else perDay.set(k, (perDay.get(k) || 0) + 1);
    }

    const elapsedDays = Math.round((today.getTime() - start.getTime()) / DAY_MS) + 1;
    const doneInWindow = total - activePending - doneBeforeStart;
    const velocity = doneInWindow / elapsedDays; // cases per day
    const daysLeft = activePending === 0 ? 0 : velocity > 0 ? Math.ceil(activePending / velocity) : null;
    const forecastDay = daysLeft !== null ? addDays(today, daysLeft) : null;
    const lastDay =
      forecastDay && daysLeft! <= MAX_BURNDOWN_DAYS ? forecastDay : addDays(today, 7);
    const startRemaining = total - doneBeforeStart;
    const forecastSpan = forecastDay
      ? Math.max(1, Math.round((forecastDay.getTime() - start.getTime()) / DAY_MS))
      : null;

    const points: NonNullable<DashboardData["burndown"]>["points"] = [];
    let remaining = startRemaining;
    for (let d = start, i = 0; d <= lastDay; d = addDays(d, 1), i++) {
      const k = dayKey(d);
      const isPast = k <= todayKey;
      const done = isPast ? perDay.get(k) || 0 : null;
      if (isPast) remaining -= done!;
      points.push({
        day: k,
        executed: done,
        remaining: isPast ? remaining : null,
        forecast:
          forecastSpan !== null ? Math.max(0, startRemaining * (1 - i / forecastSpan)) : null,
      });
    }

    burndown = {
      points,
      total,
      pending: activePending,
      velocity: Math.round(velocity * 10) / 10,
      forecastDay: forecastDay ? dayKey(forecastDay) : null,
      daysLeft,
    };
  }

  // ---------- Latest results ----------
  const latest = executed
    .slice()
    .sort((a, b) => (a.executedAt! < b.executedAt! ? 1 : -1))
    .slice(0, LATEST_RESULTS);
  const latestResults = {
    statuses: latest.map((r) => r.status),
    from: latest.length ? latest[latest.length - 1].executedAt!.slice(0, 10) : null,
    to: latest.length ? latest[0].executedAt!.slice(0, 10) : null,
  };

  // ---------- Activity, last 14 days ----------
  const activityStart = dayKey(addDays(today, -(ACTIVITY_DAYS - 1)));
  const activity: DashboardData["activity"] = [];
  for (let i = ACTIVITY_DAYS - 1; i >= 0; i--) {
    activity.push({ day: dayKey(addDays(today, -i)), passed: 0, failed: 0, blocked: 0, skipped: 0, defects: 0 });
  }
  const activityByDay = new Map(activity.map((a) => [a.day, a]));
  for (const r of executed) {
    const a = activityByDay.get(r.executedAt!.slice(0, 10));
    if (a && r.status !== "untested") a[r.status]++;
  }
  for (const d of defectRows) {
    const a = activityByDay.get(d.createdAt.slice(0, 10));
    if (a) a.defects++;
  }

  // ---------- Who ran the tests ----------
  // Playwright results come in through the API key, so they have no executor.
  const testersById = new Map<string, DashboardData["testers"][number]>();
  for (const r of executed) {
    const key = r.executedBy ?? "__automation__";
    let t = testersById.get(key);
    if (!t) {
      t = {
        name: r.executedBy ? r.executorName || "Usuario eliminado" : "Playwright (automático)",
        automated: !r.executedBy,
        counts: emptyCounts(),
        total: 0,
        recent: 0,
        lastAt: r.executedAt!,
      };
      testersById.set(key, t);
    }
    t.counts[r.status]++;
    t.total++;
    if (r.executedAt!.slice(0, 10) >= activityStart) t.recent++;
    if (r.executedAt! > t.lastAt) t.lastAt = r.executedAt!;
  }
  const testers = [...testersById.values()].sort((a, b) => b.total - a.total);

  // ---------- Project completion ----------
  // Each case counts with its most recent result across all runs; the project
  // is "complete" for a case once that latest result is Passed.
  const totalCases = Number(caseCountRes[0]?.count ?? 0);
  const chronological = executed
    .slice()
    .sort((a, b) => (a.executedAt! < b.executedAt! ? -1 : 1));
  const latestByCase = new Map<string, Status>();
  const progressStart = dayKey(addDays(today, -(PROGRESS_DAYS - 1)));
  const progressTrend: DashboardData["completion"]["trend"] = [];
  let idx = 0;
  const advanceTo = (k: string) => {
    while (idx < chronological.length && chronological[idx].executedAt!.slice(0, 10) <= k) {
      latestByCase.set(chronological[idx].caseId, chronological[idx].status);
      idx++;
    }
  };
  const passedCount = () => [...latestByCase.values()].filter((s) => s === "passed").length;
  for (let i = PROGRESS_DAYS - 1; i >= 0; i--) {
    const k = dayKey(addDays(today, -i));
    advanceTo(k);
    progressTrend.push({ day: k, percent: pct1(passedCount(), totalCases) });
  }
  advanceTo("9999-12-31"); // include anything dated in the future

  const latestCounts = emptyCounts();
  for (const s of latestByCase.values()) latestCounts[s]++;
  latestCounts.untested = Math.max(0, totalCases - latestByCase.size);
  const startPercent = progressTrend[0]?.percent ?? 0;
  const completion: DashboardData["completion"] = {
    totalCases,
    counts: latestCounts,
    percent: pct1(latestCounts.passed, totalCases),
    change: Math.round((pct1(latestCounts.passed, totalCases) - startPercent) * 10) / 10,
    trend: progressTrend,
    trendStart: progressStart,
  };

  // ---------- Run status (last 10 runs) ----------
  const recentIds = new Set(runs.slice(0, 10).map((r) => r.id));
  const recentCounts = emptyCounts();
  for (const r of rows) if (recentIds.has(r.runId)) recentCounts[r.status]++;

  return {
    totalCases,
    completion,
    totalRuns: runs.length,
    active: {
      count: activeRuns.length,
      notStarted,
      pending: activePending,
      contributors: activeContributors,
      daysLeft: burndown?.daysLeft ?? null,
    },
    openDefects: defectRows.filter((d) => d.status !== "closed").length,
    burndown,
    latestResults,
    activeRuns: activeRunList,
    activity,
    activityStart,
    testers,
    recentCounts,
  };
}
