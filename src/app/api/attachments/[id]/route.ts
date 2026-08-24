import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { attachments } from "@/db/schema";
import { requireUser } from "@/lib/require-auth";
import { eq } from "drizzle-orm";

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  await db.delete(attachments).where(eq(attachments.id, id));
  return NextResponse.json({ ok: true });
}
