import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { testCases } from "@/db/schema";
import { requireUser } from "@/lib/require-auth";
import { eq } from "drizzle-orm";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  const testCase = await db.query.testCases.findFirst({ where: eq(testCases.id, id) });
  if (!testCase) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(testCase);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  const body = await req.json();

  const [updated] = await db
    .update(testCases)
    .set({
      title: body.title,
      preconditions: body.preconditions,
      steps: body.steps !== undefined ? JSON.stringify(body.steps) : undefined,
      priority: body.priority,
      type: body.type,
      tags: body.tags,
      automated: body.automated,
      automationId: body.automationId,
    })
    .where(eq(testCases.id, id))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  await db.delete(testCases).where(eq(testCases.id, id));
  return NextResponse.json({ ok: true });
}
