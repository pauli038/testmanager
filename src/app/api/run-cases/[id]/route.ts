import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { testRunCases } from "@/db/schema";
import { requireUser } from "@/lib/require-auth";
import { eq } from "drizzle-orm";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  const body = await req.json();

  const [updated] = await db
    .update(testRunCases)
    .set({
      status: body.status,
      comment: body.comment,
      executedBy: user!.id,
      executedAt: new Date().toISOString(),
    })
    .where(eq(testRunCases.id, id))
    .returning();

  return NextResponse.json(updated);
}
