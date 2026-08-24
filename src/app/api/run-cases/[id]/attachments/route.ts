import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { attachments } from "@/db/schema";
import { requireUser } from "@/lib/require-auth";

// Evidence is stored inline in the database (base64), so limits stay modest —
// videos are capped at 60s client-side, which keeps them well under this size.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_VIDEO_BYTES = 30 * 1024 * 1024; // 30MB

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  const isVideo = (file.type || "").startsWith("video/");
  const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size > maxBytes) {
    return NextResponse.json(
      { error: `El archivo es muy grande (máximo ${isVideo ? "30MB" : "5MB"})` },
      { status: 413 }
    );
  }

  const mimeType = file.type || "image/png";

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");

    const [attachment] = await db
      .insert(attachments)
      .values({
        runCaseId: id,
        filename: file.name,
        data: base64,
        mimeType,
      })
      .returning();

    return NextResponse.json(
      {
        id: attachment.id,
        filename: attachment.filename,
        url: `data:${mimeType};base64,${base64}`,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("Failed to save attachment:", err);
    return NextResponse.json({ error: "No se pudo guardar el archivo en la base de datos" }, { status: 500 });
  }
}
