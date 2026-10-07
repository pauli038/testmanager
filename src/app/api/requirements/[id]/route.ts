import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { requirements } from "@/db/schema";
import { requireUser } from "@/lib/require-auth";
import { eq } from "drizzle-orm";

// Removes a requirement from the project's list. Its cases (if any) stay, and
// keep showing in the matrix under the same key, since that comes from their
// codes.
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  await db.delete(requirements).where(eq(requirements.id, id));
  return NextResponse.json({ ok: true });
}
