import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects, testSuites, testCases, testPlans, testRuns, testRunCases, defects } from "@/db/schema";
import { requireUser } from "@/lib/require-auth";
import { eq, inArray, sql } from "drizzle-orm";
import { buildReportDocument, statsTable, docToBuffer } from "@/lib/report-docx";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;

  const project = await db.query.projects.findFirst({ where: eq(projects.id, id) });
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

  const suiteIds = (
    await db.query.testSuites.findMany({ where: eq(testSuites.projectId, id), columns: { id: true } })
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
    (await db.select({ count: sql<number>`count(*)` }).from(testPlans).where(eq(testPlans.projectId, id)))[0]
      .count
  );

  const runs = await db.query.testRuns.findMany({ where: eq(testRuns.projectId, id), columns: { id: true } });
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
    .where(eq(defects.projectId, id))
    .groupBy(defects.status);
  const defectStats: Record<string, number> = { open: 0, in_progress: 0, closed: 0 };
  for (const row of defectStatusRows) defectStats[row.status] = Number(row.count);
  const totalDefects = Object.values(defectStats).reduce((a, b) => a + b, 0);

  const defectSeverityRows = await db
    .select({ severity: defects.severity, count: sql<number>`count(*)` })
    .from(defects)
    .where(eq(defects.projectId, id))
    .groupBy(defects.severity);
  const severityStats: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const row of defectSeverityRows) severityStats[row.severity] = Number(row.count);

  const doc = buildReportDocument(
    `Reporte general - ${project.name}`,
    `Generado: ${new Date().toLocaleString("es-ES")}`,
    [
      {
        heading: "Resumen general",
        table: statsTable([
          { label: "Suites de prueba", value: totalSuites },
          { label: "Test cases", value: totalCases },
          { label: "Planes de prueba", value: totalPlans },
          { label: "Test runs", value: totalRuns },
          { label: "Defectos", value: totalDefects },
        ]),
      },
      {
        heading: "Resultados de ejecución (todos los runs)",
        table: statsTable([
          { label: "Aprobados", value: runStats.passed },
          { label: "Fallidos", value: runStats.failed },
          { label: "Bloqueados", value: runStats.blocked },
          { label: "Omitidos", value: runStats.skipped },
          { label: "Sin ejecutar", value: runStats.untested },
        ]),
      },
      {
        heading: "Defectos por estado",
        table: statsTable([
          { label: "Abiertos", value: defectStats.open },
          { label: "En progreso", value: defectStats.in_progress },
          { label: "Cerrados", value: defectStats.closed },
        ]),
      },
      {
        heading: "Defectos por severidad",
        table: statsTable([
          { label: "Baja", value: severityStats.low },
          { label: "Media", value: severityStats.medium },
          { label: "Alta", value: severityStats.high },
          { label: "Crítica", value: severityStats.critical },
        ]),
      },
    ]
  );

  const buffer = await docToBuffer(doc);
  const safeName = project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="reporte-general-${safeName}.docx"`,
    },
  });
}
