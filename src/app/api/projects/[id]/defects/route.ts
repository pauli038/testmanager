import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { defects, defectTestCases } from "@/db/schema";
import { requireUser } from "@/lib/require-auth";
import { eq } from "drizzle-orm";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  const all = await db.query.defects.findMany({
    where: eq(defects.projectId, id),
    orderBy: (d, { desc }) => [desc(d.createdAt)],
    with: {
      attachments: true,
      testCases: { with: { case: { columns: { id: true, title: true } } } },
    },
  });
  const result = all.map((d) => ({
    ...d,
    attachments: d.attachments.map((a) => ({
      id: a.id,
      filename: a.filename,
      url: `data:${a.mimeType};base64,${a.data}`,
      retestId: a.retestId,
    })),
    cases: d.testCases.map((tc) => tc.case),
    testCases: undefined,
  }));
  return NextResponse.json(result);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  const body = await req.json();
  if (!body.title) return NextResponse.json({ error: "Título requerido" }, { status: 400 });

  const caseIds: string[] = Array.isArray(body.caseIds)
    ? body.caseIds
    : body.caseId
    ? [body.caseId]
    : [];

  const [defect] = await db
    .insert(defects)
    .values({
      projectId: id,
      runCaseId: body.runCaseId || null,
      title: body.title,
      description: body.description || null,
      stepsToReproduce: JSON.stringify(body.stepsToReproduce || []),
      module: body.module || null,
      environment: body.environment || null,
      detectedAt: body.detectedAt || null,
      severity: body.severity || "medium",
      retests: JSON.stringify(body.retests || []),
      createdBy: user!.id,
    })
    .returning();

  let cases: { id: string; title: string }[] = [];
  if (caseIds.length) {
    await db.insert(defectTestCases).values(caseIds.map((caseId) => ({ defectId: defect.id, caseId })));
    const linked = await db.query.defectTestCases.findMany({
      where: eq(defectTestCases.defectId, defect.id),
      with: { case: { columns: { id: true, title: true } } },
    });
    cases = linked.map((l) => l.case);
  }

  return NextResponse.json({ ...defect, attachments: [], cases }, { status: 201 });
}
