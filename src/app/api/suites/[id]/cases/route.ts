import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { testCases, testSuites } from "@/db/schema";
import { requireUser } from "@/lib/require-auth";
import { validateCode } from "@/lib/case-code";
import { eq, sql } from "drizzle-orm";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  const cases = await db.query.testCases.findMany({
    where: eq(testCases.suiteId, id),
    orderBy: (c, { asc }) => [sql`${c.code} asc nulls last`, asc(c.title)],
  });
  return NextResponse.json(cases);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  const body = await req.json();
  if (!body.title) return NextResponse.json({ error: "Título requerido" }, { status: 400 });

  const suite = await db.query.testSuites.findFirst({ where: eq(testSuites.id, id) });
  if (!suite) return NextResponse.json({ error: "Suite no encontrada" }, { status: 404 });
  const { code, error: codeError, status } = await validateCode(body.code, suite.projectId);
  if (codeError) return NextResponse.json({ error: codeError }, { status });

  const [testCase] = await db
    .insert(testCases)
    .values({
      suiteId: id,
      code,
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
