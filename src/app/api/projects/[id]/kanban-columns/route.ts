import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { caseKanbanColumns } from "@/db/schema";
import { requireUser } from "@/lib/require-auth";
import { eq, asc } from "drizzle-orm";

const DEFAULT_COLUMNS = [
  { key: "backlog", label: "Backlog", color: "slate" },
  { key: "diseno", label: "Diseño", color: "blue" },
  { key: "listo", label: "Listo para prueba", color: "amber" },
  { key: "ejecucion", label: "En ejecución", color: "purple" },
  { key: "cerrado", label: "Cerrado", color: "emerald" },
];

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;

  let columns = await db.query.caseKanbanColumns.findMany({
    where: eq(caseKanbanColumns.projectId, id),
    orderBy: [asc(caseKanbanColumns.position)],
  });

  if (columns.length === 0) {
    columns = await db
      .insert(caseKanbanColumns)
      .values(
        DEFAULT_COLUMNS.map((c, i) => ({
          projectId: id,
          key: c.key,
          label: c.label,
          color: c.color,
          position: i,
        }))
      )
      .returning();
  }

  return NextResponse.json(columns);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  const body = await req.json();
  if (!body.label || typeof body.label !== "string") {
    return NextResponse.json({ error: "El nombre de la columna es requerido" }, { status: 400 });
  }

  const existing = await db.query.caseKanbanColumns.findMany({
    where: eq(caseKanbanColumns.projectId, id),
  });
  const key = `col_${crypto.randomUUID().slice(0, 8)}`;
  const nextPosition = existing.length
    ? Math.max(...existing.map((c) => c.position)) + 1
    : 0;

  const [column] = await db
    .insert(caseKanbanColumns)
    .values({
      projectId: id,
      key,
      label: body.label,
      color: body.color || "slate",
      position: nextPosition,
    })
    .returning();

  return NextResponse.json(column, { status: 201 });
}
