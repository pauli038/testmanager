import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { testCases } from "@/db/schema";
import { requireUser } from "@/lib/require-auth";
import { eq } from "drizzle-orm";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  const cases = await db.query.testCases.findMany({
    where: eq(testCases.suiteId, id),
    orderBy: (c, { asc }) => [asc(c.title)],
  });
  return NextResponse.json(cases);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  const body = await req.json();
  if (!body.title) return NextResponse.json({ error: "Título requerido" }, { status: 400 });

  const [testCase] = await db
    .insert(testCases)
    .values({
      suiteId: id,
      title: body.title,
      preconditions: body.preconditions || null,
      steps: JSON.stringify(body.steps || []),
      priority: body.priority || "medium",
      type: body.type || "functional",
      tags: body.tags || "",
      automated: !!body.automated,
      automationId: body.automationId || null,
      createdBy: user!.id,
    })
    .returning();

  return NextResponse.json(testCase, { status: 201 });
}
