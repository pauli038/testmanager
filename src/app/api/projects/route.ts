import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects, projectMembers } from "@/db/schema";
import { requireUser } from "@/lib/require-auth";
import { eq } from "drizzle-orm";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;

  const all = await db.query.projects.findMany({
    orderBy: (p, { desc }) => [desc(p.createdAt)],
  });
  return NextResponse.json(all);
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;

  const body = await req.json();
  if (!body.name || typeof body.name !== "string") {
    return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });
  }

  const [project] = await db
    .insert(projects)
    .values({ name: body.name, description: body.description || null, createdBy: user!.id })
    .returning();

  await db.insert(projectMembers).values({
    projectId: project.id,
    userId: user!.id,
    role: "admin",
  });

  return NextResponse.json(project, { status: 201 });
}
