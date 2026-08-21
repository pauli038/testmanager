import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { defects } from "@/db/schema";
import { requireUser } from "@/lib/require-auth";
import { eq } from "drizzle-orm";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  const all = await db.query.defects.findMany({
    where: eq(defects.projectId, id),
    orderBy: (d, { desc }) => [desc(d.createdAt)],
    with: { attachments: true },
  });
  const result = all.map((d) => ({
    ...d,
    attachments: d.attachments.map((a) => ({
      id: a.id,
      filename: a.filename,
      url: `data:${a.mimeType};base64,${a.data}`,
    })),
  }));
  return NextResponse.json(result);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  const body = await req.json();
  if (!body.title) return NextResponse.json({ error: "Título requerido" }, { status: 400 });

  const [defect] = await db
    .insert(defects)
    .values({
      projectId: id,
      runCaseId: body.runCaseId || null,
      title: body.title,
      description: body.description || null,
      severity: body.severity || "medium",
      createdBy: user!.id,
    })
    .returning();

  return NextResponse.json({ ...defect, attachments: [] }, { status: 201 });
}
