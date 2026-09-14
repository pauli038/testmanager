import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { attachments, uploadChunks } from "@/db/schema";
import { requireUser } from "@/lib/require-auth";
import { asc, eq } from "drizzle-orm";

// Some reverse proxies / tunnels (e.g. VS Code Dev Tunnels) reject large
// request bodies with a 413 well below our own size limits. Uploading in
// small chunks and assembling them here sidesteps that, whatever the exact
// external cutoff is. Chunks are staged in the database rather than an
// in-memory buffer: this runs as stateless serverless functions (Vercel), so
// consecutive chunk requests for the same uploadId can land on different
// instances and an in-memory Map would silently lose parts.
const MAX_TOTAL_BYTES = 100 * 1024 * 1024; // 100MB

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

  const chunkBase64 = Buffer.from(await chunk.arrayBuffer()).toString("base64");
  await db.insert(uploadChunks).values({ uploadId, chunkIndex, data: chunkBase64 });

  if (chunkIndex < totalChunks - 1) {
    return NextResponse.json({ ok: true, received: chunkIndex });
  }

  // Last chunk received — assemble and persist.
  try {
    const rows = await db
      .select()
      .from(uploadChunks)
      .where(eq(uploadChunks.uploadId, uploadId))
      .orderBy(asc(uploadChunks.chunkIndex));

    if (rows.length !== totalChunks || rows.some((r, i) => r.chunkIndex !== i)) {
      return NextResponse.json({ error: "Faltan partes del archivo, intenta de nuevo" }, { status: 400 });
    }

    const full = Buffer.concat(rows.map((r) => Buffer.from(r.data, "base64")));
    if (full.length > MAX_TOTAL_BYTES) {
      return NextResponse.json({ error: "El archivo es muy grande (máximo 100MB)" }, { status: 413 });
    }

    const [attachment] = await db
      .insert(attachments)
      .values({ runCaseId: id, filename, data: full.toString("base64"), mimeType })
      .returning();

    return NextResponse.json(
      {
        id: attachment.id,
        filename: attachment.filename,
        url: `/api/attachments/${attachment.id}`,
        mimeType,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("Failed to save chunked attachment:", err);
    return NextResponse.json({ error: "No se pudo guardar el archivo en la base de datos" }, { status: 500 });
  } finally {
    await db.delete(uploadChunks).where(eq(uploadChunks.uploadId, uploadId));
  }
}
