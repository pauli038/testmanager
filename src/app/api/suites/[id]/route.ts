import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { testSuites } from "@/db/schema";
import { requireUser } from "@/lib/require-auth";
import { eq } from "drizzle-orm";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  const body = await req.json();
  const [updated] = await db
    .update(testSuites)
    .set({ name: body.name, description: body.description })
    .where(eq(testSuites.id, id))
    .returning();
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  await db.delete(testSuites).where(eq(testSuites.id, id));
  return NextResponse.json({ ok: true });
}
