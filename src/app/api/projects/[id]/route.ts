import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { requireUser } from "@/lib/require-auth";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { canDeleteProject, canManageProject } from "@/lib/permissions";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;

  const project = await db.query.projects.findFirst({ where: eq(projects.id, id) });
  if (!project) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(project);
}

const updateSchema = z.object({
  name: z.string().trim().min(1, "El nombre es requerido"),
  description: z.string().trim().nullable().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canManageProject(user!.role)) {
    return NextResponse.json(
      { error: "Solo un admin o lead puede editar proyectos" },
      { status: 403 }
    );
  }
  const { id } = await ctx.params;
  const parsed = updateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });
  }

  const [updated] = await db
    .update(projects)
    .set({ name: parsed.data.name, description: parsed.data.description || null })
    .where(eq(projects.id, id))
    .returning();
  if (!updated) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canDeleteProject(user!.role)) {
    return NextResponse.json({ error: "Solo un admin puede eliminar proyectos" }, { status: 403 });
  }
  const { id } = await ctx.params;
  await db.delete(projects).where(eq(projects.id, id));
  return NextResponse.json({ ok: true });
}
