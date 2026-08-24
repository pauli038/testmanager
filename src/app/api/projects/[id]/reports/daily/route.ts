import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects, testSuites, testCases, testRuns, testPlans, defects } from "@/db/schema";
import { requireUser } from "@/lib/require-auth";
import { eq, and, inArray, sql } from "drizzle-orm";
import { buildReportDocument, statsTable, docToBuffer } from "@/lib/report-docx";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || new Date().toISOString().slice(0, 10);

  const project = await db.query.projects.findFirst({ where: eq(projects.id, id) });
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

  const suiteIds = (
    await db.query.testSuites.findMany({
      where: eq(testSuites.projectId, id),
      columns: { id: true },
    })
  ).map((s) => s.id);

  const casesCreated = suiteIds.length
    ? Number(
        (
          await db
            .select({ count: sql<number>`count(*)` })
            .from(testCases)
            .where(
              and(
                inArray(testCases.suiteId, suiteIds),
                sql`${testCases.createdAt}::date = ${date}::date`
              )
            )
        )[0].count
      )
    : 0;

  const runsCreated = Number(
    (
      await db
        .select({ count: sql<number>`count(*)` })
        .from(testRuns)
        .where(and(eq(testRuns.projectId, id), sql`${testRuns.createdAt}::date = ${date}::date`))
    )[0].count
  );

  const plansCreated = Number(
    (
      await db
        .select({ count: sql<number>`count(*)` })
        .from(testPlans)
        .where(and(eq(testPlans.projectId, id), sql`${testPlans.createdAt}::date = ${date}::date`))
    )[0].count
  );

  const defectsCreated = Number(
    (
      await db
        .select({ count: sql<number>`count(*)` })
        .from(defects)
        .where(and(eq(defects.projectId, id), sql`${defects.createdAt}::date = ${date}::date`))
    )[0].count
  );

  const doc = buildReportDocument(`Reporte diario - ${project.name}`, `Fecha: ${date}`, [
    {
      heading: "Resumen del día",
      table: statsTable([
        { label: "Test cases creados", value: casesCreated },
        { label: "Test runs creados", value: runsCreated },
        { label: "Planes creados", value: plansCreated },
        { label: "Defectos creados", value: defectsCreated },
      ]),
    },
  ]);

  const buffer = await docToBuffer(doc);
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="reporte-diario-${date}.docx"`,
    },
  });
}
