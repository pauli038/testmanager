import { db } from "@/db";
import {
  defects,
  defectTestCases,
  requirements as requirementsTable,
  testCases,
  testRunCases,
  testSuites,
} from "@/db/schema";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { requirementOf } from "@/lib/requirement-key";

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
//  - uncovered:   in the project's requirement list but no case has its code
export type RequirementHealth = "at_risk" | "covered" | "in_progress" | "not_run" | "uncovered";

export type Requirement = {
  key: string; // "RF-020", "CAT"…
  // From the loaded requirement list; null when the requirement only comes
  // from case codes.
  id: string | null;
  title: string | null;
  cases: TraceCase[];
  counts: Record<CaseStatus, number>;
  automated: number;
  openDefects: number;
  health: RequirementHealth;
};

export type TraceabilityData = {
  requirements: Requirement[];
  // Whether the project has a loaded requirement list. Without one, the
  // matrix can't know about requirements that have no cases.
  hasCatalog: boolean;
  // Cases whose code doesn't name a requirement (or that have no code).
  unassigned: TraceCase[];
};

export function healthOf(counts: Record<CaseStatus, number>, total: number): RequirementHealth {
  if (total === 0) return "uncovered";
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
  const [suites, catalog] = await Promise.all([
    db.query.testSuites.findMany({
      where: eq(testSuites.projectId, projectId),
      columns: { id: true, name: true },
    }),
    db.query.requirements.findMany({ where: eq(requirementsTable.projectId, projectId) }),
  ]);
  const catalogByKey = new Map(catalog.map((r) => [r.key, r]));
  if (suites.length === 0) {
    return {
      requirements: catalog
        .sort((a, b) => a.key.localeCompare(b.key, "es", { numeric: true }))
        .map((r) => ({
          key: r.key,
          id: r.id,
          title: r.title,
          cases: [],
          counts: emptyCounts(),
          automated: 0,
          openDefects: 0,
          health: "uncovered" as const,
        })),
      hasCatalog: catalog.length > 0,
      unassigned: [],
    };
  }
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

  // Every listed requirement appears, with or without cases.
  for (const r of catalog) if (!byRequirement.has(r.key)) byRequirement.set(r.key, []);

  const requirements = [...byRequirement.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "es", { numeric: true }))
    .map(([key, list]): Requirement => {
      const counts = emptyCounts();
      for (const c of list) counts[c.status]++;
      const listed = catalogByKey.get(key);
      return {
        key,
        id: listed?.id ?? null,
        title: listed?.title ?? null,
        cases: list,
        counts,
        automated: list.filter((c) => c.automated).length,
        openDefects: list.reduce((n, c) => n + c.openDefects, 0),
        health: healthOf(counts, list.length),
      };
    });

  return { requirements, hasCatalog: catalog.length > 0, unassigned };
}
