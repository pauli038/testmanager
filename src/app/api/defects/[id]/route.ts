import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { defects } from "@/db/schema";
import { requireUser } from "@/lib/require-auth";
import { eq } from "drizzle-orm";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  const body = await req.json();

  const [updated] = await db
    .update(defects)
    .set({
      title: body.title,
      description: body.description,
      severity: body.severity,
      status: body.status,
    })
    .where(eq(defects.id, id))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  await db.delete(defects).where(eq(defects.id, id));
  return NextResponse.json({ ok: true });
}
