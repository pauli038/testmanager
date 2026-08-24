import { db } from "@/db";
import { testSuites, testCases, testRunCases } from "@/db/schema";
import { eq, and, ne, inArray, desc } from "drizzle-orm";
import SuitesExplorer from "@/components/SuitesExplorer";

type CaseRow = typeof testCases.$inferSelect;

export default async function SuitesPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  const suites = await db.query.testSuites.findMany({
    where: eq(testSuites.projectId, id),
  });

  const casesBySuite: Record<string, CaseRow[]> = {};
  for (const suite of suites) {
    casesBySuite[suite.id] = await db.query.testCases.findMany({
      where: eq(testCases.suiteId, suite.id),
    });
  }

  const allCaseIds = Object.values(casesBySuite)
    .flat()
    .map((c) => c.id);

  const lastStatusByCase: Record<string, string> = {};
  if (allCaseIds.length > 0) {
    const executedRows = await db
      .select({ caseId: testRunCases.caseId, status: testRunCases.status })
      .from(testRunCases)
      .where(and(inArray(testRunCases.caseId, allCaseIds), ne(testRunCases.status, "untested")))
      .orderBy(desc(testRunCases.executedAt));
    for (const row of executedRows) {
      if (!(row.caseId in lastStatusByCase)) lastStatusByCase[row.caseId] = row.status;
    }
  }

  const casesWithStatus: Record<string, (CaseRow & { lastStatus: string | null })[]> = {};
  for (const suiteId in casesBySuite) {
    casesWithStatus[suiteId] = casesBySuite[suiteId].map((c) => ({
      ...c,
      lastStatus: lastStatusByCase[c.id] || null,
    }));
  }

  return (
    <SuitesExplorer projectId={id} initialSuites={suites} initialCases={casesWithStatus} />
  );
}
