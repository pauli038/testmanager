import { db } from "@/db";
import { testSuites, testCases, testRunCases, caseKanbanColumns } from "@/db/schema";
import { eq, and, ne, inArray, desc, asc } from "drizzle-orm";
import CasesView from "@/components/CasesView";

type CaseRow = typeof testCases.$inferSelect;

const DEFAULT_COLUMNS = [
  { key: "backlog", label: "Backlog", color: "slate" },
  { key: "diseno", label: "Diseño", color: "blue" },
  { key: "listo", label: "Listo para prueba", color: "amber" },
  { key: "ejecucion", label: "En ejecución", color: "purple" },
  { key: "cerrado", label: "Cerrado", color: "emerald" },
];

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

  let columns = await db.query.caseKanbanColumns.findMany({
    where: eq(caseKanbanColumns.projectId, id),
    orderBy: [asc(caseKanbanColumns.position)],
  });
  if (columns.length === 0) {
    columns = await db
      .insert(caseKanbanColumns)
      .values(DEFAULT_COLUMNS.map((c, i) => ({ projectId: id, ...c, position: i })))
      .returning();
  }

  const suiteNameById = Object.fromEntries(suites.map((s) => [s.id, s.name]));
  const kanbanCases = Object.values(casesWithStatus)
    .flat()
    .map((c) => ({
      id: c.id,
      title: c.title,
      suiteId: c.suiteId,
      suiteName: suiteNameById[c.suiteId] || "",
      priority: c.priority,
      automated: c.automated,
      phase: c.phase,
      lastStatus: c.lastStatus,
    }));

  return (
    <CasesView
      projectId={id}
      initialSuites={suites}
      initialCases={casesWithStatus}
      initialColumns={columns}
      initialKanbanCases={kanbanCases}
    />
  );
}
