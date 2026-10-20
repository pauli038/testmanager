import { db } from "@/db";
import { testSuites, testCases } from "@/db/schema";
import { asc, eq, inArray, sql } from "drizzle-orm";

export type CaseRef = { id: string; code: string | null; title: string };

// A project's suites and their cases, for picking cases to put in a run.
// One query for every suite's cases, ordered by code (cases without one go
// last, by title).
export async function loadProjectCases(projectId: string) {
  const suites = await db.query.testSuites.findMany({ where: eq(testSuites.projectId, projectId) });
  const casesBySuite: Record<string, CaseRef[]> = Object.fromEntries(suites.map((s) => [s.id, []]));
  const cases = suites.length
    ? await db
        .select({ id: testCases.id, code: testCases.code, title: testCases.title, suiteId: testCases.suiteId })
        .from(testCases)
        .where(inArray(testCases.suiteId, suites.map((s) => s.id)))
        .orderBy(sql`${testCases.code} asc nulls last`, asc(testCases.title))
    : [];
  for (const { suiteId, ...c } of cases) casesBySuite[suiteId].push(c);
  return { suites, casesBySuite };
}
