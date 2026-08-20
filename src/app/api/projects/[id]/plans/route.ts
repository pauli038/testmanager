import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { testPlans } from "@/db/schema";
import { requireUser } from "@/lib/require-auth";
import { eq } from "drizzle-orm";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  const plans = await db.query.testPlans.findMany({
    where: eq(testPlans.projectId, id),
    orderBy: (p, { desc }) => [desc(p.createdAt)],
  });
  return NextResponse.json(plans);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  const body = await req.json();
  if (!body.name) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });

  const [plan] = await db
    .insert(testPlans)
    .values({
      projectId: id,
      name: body.name,
      description: body.description || null,
      createdBy: user!.id,
    })
    .returning();

  return NextResponse.json(plan, { status: 201 });
}
