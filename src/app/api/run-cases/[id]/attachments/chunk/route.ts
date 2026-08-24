import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { attachments } from "@/db/schema";
import { requireUser } from "@/lib/require-auth";

// Some reverse proxies / tunnels (e.g. VS Code Dev Tunnels) reject large
// request bodies with a 413 well below our own size limits. Uploading in
// small chunks and assembling them here sidesteps that, whatever the exact
// external cutoff is. This buffer is in-memory, which only works because
// this app runs as a single long-lived container (see Dockerfile) — it
// would need a shared store (Redis, etc.) on a multi-instance deployment.
const uploadBuffers = new Map<string, Buffer[]>();
const MAX_TOTAL_BYTES = 30 * 1024 * 1024; // 30MB

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;

  const formData = await req.formData();
  const chunk = formData.get("chunk") as File | null;
  const uploadId = formData.get("uploadId") as string | null;
  const chunkIndex = Number(formData.get("chunkIndex"));
  const totalChunks = Number(formData.get("totalChunks"));
  const filename = (formData.get("filename") as string) || "evidence";
  const mimeType = (formData.get("mimeType") as string) || "application/octet-stream";

  if (!chunk || !uploadId || Number.isNaN(chunkIndex) || Number.isNaN(totalChunks)) {
    return NextResponse.json({ error: "Datos de parte inválidos" }, { status: 400 });
  }

  const parts = uploadBuffers.get(uploadId) || [];
  parts[chunkIndex] = Buffer.from(await chunk.arrayBuffer());
  uploadBuffers.set(uploadId, parts);

  if (chunkIndex < totalChunks - 1) {
    return NextResponse.json({ ok: true, received: chunkIndex });
  }

  // Last chunk received — assemble and persist.
  uploadBuffers.delete(uploadId);
  if (parts.length !== totalChunks || parts.some((p) => !p)) {
    return NextResponse.json({ error: "Faltan partes del archivo, intenta de nuevo" }, { status: 400 });
  }

  const full = Buffer.concat(parts);
  if (full.length > MAX_TOTAL_BYTES) {
    return NextResponse.json({ error: "El archivo es muy grande (máximo 30MB)" }, { status: 413 });
  }

  try {
    const base64 = full.toString("base64");
    const [attachment] = await db
      .insert(attachments)
      .values({ runCaseId: id, filename, data: base64, mimeType })
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
    console.error("Failed to save chunked attachment:", err);
    return NextResponse.json({ error: "No se pudo guardar el archivo en la base de datos" }, { status: 500 });
  }
}
