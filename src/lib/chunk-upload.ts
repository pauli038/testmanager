import { NextResponse } from "next/server";
import { db } from "@/db";
import { attachments } from "@/db/schema";

// Some reverse proxies / tunnels (e.g. VS Code Dev Tunnels) reject large
// request bodies with a 413 well below our own size limits. Uploading in
// small chunks and assembling them here sidesteps that, whatever the exact
// external cutoff is. This buffer is in-memory, which only works because
// this app runs as a single long-lived container (see Dockerfile) — it
// would need a shared store (Redis, etc.) on a multi-instance deployment.
const uploadBuffers = new Map<string, Buffer[]>();

// Receives one chunk of a run-case attachment (form fields: chunk, uploadId,
// chunkIndex, totalChunks, filename, mimeType) and, on the last one, stores
// the whole file. Callers check auth and that `runCaseId` is theirs first.
export async function receiveRunCaseChunk(
  formData: FormData,
  runCaseId: string,
  maxBytes: number
): Promise<NextResponse> {
  const chunk = formData.get("chunk") as File | null;
  const uploadId = formData.get("uploadId") as string | null;
  const chunkIndex = Number(formData.get("chunkIndex"));
  const totalChunks = Number(formData.get("totalChunks"));
  const filename = (formData.get("filename") as string) || "evidence";
  const mimeType = (formData.get("mimeType") as string) || "application/octet-stream";

  if (!chunk || !uploadId || Number.isNaN(chunkIndex) || Number.isNaN(totalChunks)) {
    return NextResponse.json({ error: "Datos de parte inválidos" }, { status: 400 });
  }

  // Scope the buffer to the run case so two uploads can't mix their parts.
  const key = `${runCaseId}:${uploadId}`;
  const parts = uploadBuffers.get(key) || [];
  parts[chunkIndex] = Buffer.from(await chunk.arrayBuffer());
  uploadBuffers.set(key, parts);

  if (chunkIndex < totalChunks - 1) {
    return NextResponse.json({ ok: true, received: chunkIndex });
  }

  // Last chunk received — assemble and persist.
  uploadBuffers.delete(key);
  if (parts.length !== totalChunks || parts.some((p) => !p)) {
    return NextResponse.json({ error: "Faltan partes del archivo, intenta de nuevo" }, { status: 400 });
  }

  const full = Buffer.concat(parts);
  if (full.length > maxBytes) {
    return NextResponse.json(
      { error: `El archivo es muy grande (máximo ${Math.round(maxBytes / 1024 / 1024)}MB)` },
      { status: 413 }
    );
  }

  try {
    const [attachment] = await db
      .insert(attachments)
      .values({ runCaseId, filename, data: full.toString("base64"), mimeType })
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
  }
}
