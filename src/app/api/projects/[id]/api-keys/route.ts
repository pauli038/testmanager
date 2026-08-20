import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { requireUser } from "@/lib/require-auth";
import { eq } from "drizzle-orm";
import { generateApiKey } from "@/lib/api-key";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  const keys = await db.query.apiKeys.findMany({ where: eq(apiKeys.projectId, id) });
  return NextResponse.json(keys);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  const body = await req.json();

  const [key] = await db
    .insert(apiKeys)
    .values({
      projectId: id,
      name: body.name || "Playwright CI",
      key: generateApiKey(),
      createdBy: user!.id,
    })
    .returning();

  return NextResponse.json(key, { status: 201 });
}
