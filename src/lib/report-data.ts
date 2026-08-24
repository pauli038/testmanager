import { db } from "@/db";
import { projects, testSuites, testCases, testRuns, testPlans, testRunCases, defects } from "@/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";

export type ReportSection = { heading: string; rows: { label: string; value: string | number }[] };
export type ReportData = { title: string; subtitle: string; sections: ReportSection[]; filenameBase: string };

async function getProjectOrThrow(projectId: string) {
  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!project) throw new Error("NOT_FOUND");
  return project;
}

export async function getDailyReportData(projectId: string, date: string): Promise<ReportData> {
  const project = await getProjectOrThrow(projectId);

  const suiteIds = (
    await db.query.testSuites.findMany({ where: eq(testSuites.projectId, projectId), columns: { id: true } })
  ).map((s) => s.id);

  const casesCreated = suiteIds.length
    ? Number(
        (
          await db
            .select({ count: sql<number>`count(*)` })
            .from(testCases)
            .where(
              and(inArray(testCases.suiteId, suiteIds), sql`${testCases.createdAt}::date = ${date}::date`)
            )
        )[0].count
      )
    : 0;

  const runsCreated = Number(
    (
      await db
        .select({ count: sql<number>`count(*)` })
        .from(testRuns)
        .where(and(eq(testRuns.projectId, projectId), sql`${testRuns.createdAt}::date = ${date}::date`))
    )[0].count
  );

  const plansCreated = Number(
    (
      await db
        .select({ count: sql<number>`count(*)` })
        .from(testPlans)
        .where(and(eq(testPlans.projectId, projectId), sql`${testPlans.createdAt}::date = ${date}::date`))
    )[0].count
  );

  const defectsCreated = Number(
    (
      await db
        .select({ count: sql<number>`count(*)` })
        .from(defects)
        .where(and(eq(defects.projectId, projectId), sql`${defects.createdAt}::date = ${date}::date`))
    )[0].count
  );

  return {
    title: `Reporte diario - ${project.name}`,
    subtitle: `Fecha: ${date}`,
    sections: [
      {
        heading: "Resumen del día",
        rows: [
          { label: "Test cases creados", value: casesCreated },
          { label: "Test runs creados", value: runsCreated },
          { label: "Planes creados", value: plansCreated },
          { label: "Defectos creados", value: defectsCreated },
        ],
      },
    ],
    filenameBase: `reporte-diario-${date}`,
  };
}

export async function getGeneralReportData(projectId: string): Promise<ReportData> {
  const project = await getProjectOrThrow(projectId);

  const suiteIds = (
    await db.query.testSuites.findMany({ where: eq(testSuites.projectId, projectId), columns: { id: true } })
  ).map((s) => s.id);
  const totalSuites = suiteIds.length;

  const totalCases = suiteIds.length
    ? Number(
        (
          await db
            .select({ count: sql<number>`count(*)` })
            .from(testCases)
            .where(inArray(testCases.suiteId, suiteIds))
        )[0].count
      )
    : 0;

  const totalPlans = Number(
    (await db.select({ count: sql<number>`count(*)` }).from(testPlans).where(eq(testPlans.projectId, projectId)))[0]
      .count
  );

  const runs = await db.query.testRuns.findMany({
    where: eq(testRuns.projectId, projectId),
    columns: { id: true },
  });
  const totalRuns = runs.length;

  const runCaseStatusRows = runs.length
    ? await db
        .select({ status: testRunCases.status, count: sql<number>`count(*)` })
        .from(testRunCases)
        .where(
          inArray(
            testRunCases.runId,
            runs.map((r) => r.id)
          )
        )
        .groupBy(testRunCases.status)
    : [];
  const runStats: Record<string, number> = { untested: 0, passed: 0, failed: 0, blocked: 0, skipped: 0 };
  for (const row of runCaseStatusRows) runStats[row.status] = Number(row.count);

  const defectStatusRows = await db
    .select({ status: defects.status, count: sql<number>`count(*)` })
    .from(defects)
    .where(eq(defects.projectId, projectId))
    .groupBy(defects.status);
  const defectStats: Record<string, number> = { open: 0, in_progress: 0, closed: 0 };
  for (const row of defectStatusRows) defectStats[row.status] = Number(row.count);
  const totalDefects = Object.values(defectStats).reduce((a, b) => a + b, 0);

  const defectSeverityRows = await db
    .select({ severity: defects.severity, count: sql<number>`count(*)` })
    .from(defects)
    .where(eq(defects.projectId, projectId))
    .groupBy(defects.severity);
  const severityStats: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const row of defectSeverityRows) severityStats[row.severity] = Number(row.count);

  const safeName = project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

  return {
    title: `Reporte general - ${project.name}`,
    subtitle: `Generado: ${new Date().toLocaleString("es-ES")}`,
    sections: [
      {
        heading: "Resumen general",
        rows: [
          { label: "Suites de prueba", value: totalSuites },
          { label: "Test cases", value: totalCases },
          { label: "Planes de prueba", value: totalPlans },
          { label: "Test runs", value: totalRuns },
          { label: "Defectos", value: totalDefects },
        ],
      },
      {
        heading: "Resultados de ejecución (todos los runs)",
        rows: [
          { label: "Aprobados", value: runStats.passed },
          { label: "Fallidos", value: runStats.failed },
          { label: "Bloqueados", value: runStats.blocked },
          { label: "Omitidos", value: runStats.skipped },
          { label: "Sin ejecutar", value: runStats.untested },
        ],
      },
      {
        heading: "Defectos por estado",
        rows: [
          { label: "Abiertos", value: defectStats.open },
          { label: "En progreso", value: defectStats.in_progress },
          { label: "Cerrados", value: defectStats.closed },
        ],
      },
      {
        heading: "Defectos por severidad",
        rows: [
          { label: "Baja", value: severityStats.low },
          { label: "Media", value: severityStats.medium },
          { label: "Alta", value: severityStats.high },
          { label: "Crítica", value: severityStats.critical },
        ],
      },
    ],
    filenameBase: `reporte-general-${safeName}`,
  };
}
