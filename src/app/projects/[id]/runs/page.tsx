import { db } from "@/db";
import { testSuites, testCases } from "@/db/schema";
import { asc, eq, inArray, sql } from "drizzle-orm";
import RunsList from "@/components/RunsList";

export default async function RunsPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  const suites = await db.query.testSuites.findMany({ where: eq(testSuites.projectId, id) });
  // One query for every suite's cases, ordered by code (cases without one go
  // last, by title).
  const casesBySuite: Record<string, { id: string; code: string | null; title: string }[]> =
    Object.fromEntries(suites.map((s) => [s.id, []]));
  const cases = suites.length
    ? await db
        .select({ id: testCases.id, code: testCases.code, title: testCases.title, suiteId: testCases.suiteId })
        .from(testCases)
        .where(inArray(testCases.suiteId, suites.map((s) => s.id)))
        .orderBy(sql`${testCases.code} asc nulls last`, asc(testCases.title))
    : [];
  for (const { suiteId, ...c } of cases) casesBySuite[suiteId].push(c);

  return (
    <RunsList projectId={id} suites={suites} casesBySuite={casesBySuite} />
  );
}
