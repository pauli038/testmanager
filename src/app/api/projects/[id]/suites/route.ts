import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { testSuites } from "@/db/schema";
import { requireUser } from "@/lib/require-auth";
import { eq } from "drizzle-orm";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  const suites = await db.query.testSuites.findMany({
    where: eq(testSuites.projectId, id),
    orderBy: (s, { asc }) => [asc(s.name)],
  });
  return NextResponse.json(suites);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  const body = await req.json();
  if (!body.name) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });

  const [suite] = await db
    .insert(testSuites)
    .values({
      projectId: id,
      name: body.name,
      description: body.description || null,
      parentId: body.parentId || null,
    })
    .returning();

  return NextResponse.json(suite, { status: 201 });
}
