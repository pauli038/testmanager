import { db } from "@/db";
import { testSuites, testCases } from "@/db/schema";
import { eq } from "drizzle-orm";
import SuitesExplorer from "@/components/SuitesExplorer";

export default async function SuitesPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  const suites = await db.query.testSuites.findMany({
    where: eq(testSuites.projectId, id),
  });

  const casesBySuite: Record<string, any[]> = {};
  for (const suite of suites) {
    casesBySuite[suite.id] = await db.query.testCases.findMany({
      where: eq(testCases.suiteId, suite.id),
    });
  }

  return (
    <SuitesExplorer projectId={id} initialSuites={suites} initialCases={casesBySuite} />
  );
}
