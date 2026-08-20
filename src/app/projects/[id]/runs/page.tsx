import { db } from "@/db";
import { testSuites, testCases } from "@/db/schema";
import { eq } from "drizzle-orm";
import RunsList from "@/components/RunsList";

export default async function RunsPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  const suites = await db.query.testSuites.findMany({ where: eq(testSuites.projectId, id) });
  const casesBySuite: Record<string, { id: string; title: string }[]> = {};
  for (const s of suites) {
    casesBySuite[s.id] = await db
      .select({ id: testCases.id, title: testCases.title })
      .from(testCases)
      .where(eq(testCases.suiteId, s.id));
  }

  return (
    <RunsList projectId={id} suites={suites} casesBySuite={casesBySuite} />
  );
}
