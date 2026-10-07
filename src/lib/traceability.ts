import { db } from "@/db";
import { defects, defectTestCases, testCases, testRunCases, testSuites } from "@/db/schema";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";

export type CaseStatus = "untested" | "passed" | "failed" | "blocked" | "skipped";

export type TraceCase = {
  id: string;
  code: string | null;
  title: string;
  suiteName: string;
  automated: boolean;
  // Most recent result across all runs (same rule as the dashboard).
  status: CaseStatus;
  lastExecutedAt: string | null;
  openDefects: number;
};

// How a requirement is doing, from the latest result of its cases:
//  - at_risk:     some case failed or is blocked
//  - covered:     every case passed
//  - in_progress: some executed, none failed, not all passed yet
//  - not_run:     no case executed yet
export type RequirementHealth = "at_risk" | "covered" | "in_progress" | "not_run";

export type Requirement = {
  key: string; // "RF-020", "CAT"…; "" for cases without a requirement
  cases: TraceCase[];
  counts: Record<CaseStatus, number>;
  automated: number;
  openDefects: number;
  health: RequirementHealth;
};

export type TraceabilityData = {
  requirements: Requirement[];
  // Cases whose code doesn't name a requirement (or that have no code).
  unassigned: TraceCase[];
};

// Requirement a case code belongs to:
//   "TC-RF020-06"  → "RF-020"
//   "TC-RNF005-01" → "RNF-005"
//   "TC-CAT-023"   → "CAT"
// Codes that don't follow the TC-<requirement>-<n> shape have none.
export function requirementOf(code: string | null | undefined): string | null {
  const m = code?.toUpperCase().match(/^TC-([A-Z]+)(\d*)-[A-Z0-9]+$/);
  if (!m) return null;
  const [, prefix, number] = m;
  return number ? `${prefix}-${number}` : prefix;
}

export function healthOf(counts: Record<CaseStatus, number>, total: number): RequirementHealth {
  if (counts.failed + counts.blocked > 0) return "at_risk";
  if (total > 0 && counts.passed === total) return "covered";
  if (counts.untested === total) return "not_run";
  return "in_progress";
}

const emptyCounts = (): Record<CaseStatus, number> => ({
  untested: 0,
  passed: 0,
  failed: 0,
  blocked: 0,
  skipped: 0,
});

export async function getTraceabilityData(projectId: string): Promise<TraceabilityData> {
  const suites = await db.query.testSuites.findMany({
    where: eq(testSuites.projectId, projectId),
    columns: { id: true, name: true },
  });
  if (suites.length === 0) return { requirements: [], unassigned: [] };
  const suiteIds = suites.map((s) => s.id);
  const suiteName = new Map(suites.map((s) => [s.id, s.name]));

  const [cases, latest, defectLinks] = await Promise.all([
    db
      .select({
        id: testCases.id,
        code: testCases.code,
        title: testCases.title,
        suiteId: testCases.suiteId,
        automated: testCases.automated,
      })
      .from(testCases)
      .where(inArray(testCases.suiteId, suiteIds))
      .orderBy(sql`${testCases.code} asc nulls last`, asc(testCases.title)),
    // Latest executed result per case.
    db
      .selectDistinctOn([testRunCases.caseId], {
        caseId: testRunCases.caseId,
        status: testRunCases.status,
        executedAt: testRunCases.executedAt,
      })
      .from(testRunCases)
      .innerJoin(testCases, eq(testRunCases.caseId, testCases.id))
      .where(
        and(
          inArray(testCases.suiteId, suiteIds),
          ne(testRunCases.status, "untested"),
          sql`${testRunCases.executedAt} is not null`
        )
      )
      .orderBy(testRunCases.caseId, sql`${testRunCases.executedAt} desc`),
    db
      .select({ caseId: defectTestCases.caseId })
      .from(defectTestCases)
      .innerJoin(defects, eq(defectTestCases.defectId, defects.id))
      .where(and(eq(defects.projectId, projectId), ne(defects.status, "closed"))),
  ]);

  const latestByCase = new Map(latest.map((r) => [r.caseId, r]));
  const openDefectsByCase = new Map<string, number>();
  for (const { caseId } of defectLinks) {
    openDefectsByCase.set(caseId, (openDefectsByCase.get(caseId) ?? 0) + 1);
  }

  const byRequirement = new Map<string, TraceCase[]>();
  const unassigned: TraceCase[] = [];
  for (const c of cases) {
    const last = latestByCase.get(c.id);
    const tc: TraceCase = {
      id: c.id,
      code: c.code,
      title: c.title,
      suiteName: suiteName.get(c.suiteId) ?? "",
      automated: c.automated,
      status: (last?.status as CaseStatus) ?? "untested",
      lastExecutedAt: last?.executedAt ?? null,
      openDefects: openDefectsByCase.get(c.id) ?? 0,
    };
    const req = requirementOf(c.code);
    if (req) byRequirement.set(req, [...(byRequirement.get(req) ?? []), tc]);
    else unassigned.push(tc);
  }

  const requirements = [...byRequirement.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "es", { numeric: true }))
    .map(([key, list]): Requirement => {
      const counts = emptyCounts();
      for (const c of list) counts[c.status]++;
      return {
        key,
        cases: list,
        counts,
        automated: list.filter((c) => c.automated).length,
        openDefects: list.reduce((n, c) => n + c.openDefects, 0),
        health: healthOf(counts, list.length),
      };
    });

  return { requirements, unassigned };
}
