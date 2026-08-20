import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { attachments } from "@/db/schema";
import { requireUser } from "@/lib/require-auth";

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB — evidence is stored inline in the database

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: "El archivo es muy grande (máximo 5MB)" },
      { status: 413 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");
  const mimeType = file.type || "image/png";

  const [attachment] = await db
    .insert(attachments)
    .values({
      runCaseId: id,
      filename: file.name,
      data: base64,
      mimeType,
    })
    .returning();

  return NextResponse.json({
    id: attachment.id,
    filename: attachment.filename,
    url: `data:${mimeType};base64,${base64}`,
  }, { status: 201 });
}
