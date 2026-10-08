import { NextResponse } from "next/server";
import { db } from "@/db";
import { attachments, uploadChunks } from "@/db/schema";
import { asc, eq, sql } from "drizzle-orm";

// Large files arrive in small parts: some reverse proxies / tunnels (e.g. VS
// Code Dev Tunnels) and serverless hosts (Vercel, ~4.5MB per request) reject
// big request bodies. Each part is stored in upload_chunks until the last one
// arrives — not in memory, because on a serverless host every part can reach
// a different instance.

// Receives one chunk of a run-case attachment (form fields: chunk, uploadId,
// chunkIndex, totalChunks, filename, mimeType) and, on the last one, stores
// the whole file. Callers check auth and that `runCaseId` is theirs first.
// Parts must be sent one after another (the last one triggers assembly).
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

  if (
    !chunk ||
    !uploadId ||
    !Number.isInteger(chunkIndex) ||
    !Number.isInteger(totalChunks) ||
    chunkIndex < 0 ||
    chunkIndex >= totalChunks
  ) {
    return NextResponse.json({ error: "Datos de parte inválidos" }, { status: 400 });
  }

  // Scoped to the run case so two uploads can't mix their parts.
  const uploadKey = `${runCaseId}:${uploadId}`;
  const part = Buffer.from(await chunk.arrayBuffer());

  // Single-part files skip the table.
  if (totalChunks === 1) return saveAttachment(runCaseId, part, filename, mimeType, maxBytes);

  await db
    .insert(uploadChunks)
    .values({ uploadKey, chunkIndex, data: part.toString("base64") })
    .onConflictDoUpdate({
      target: [uploadChunks.uploadKey, uploadChunks.chunkIndex],
      set: { data: part.toString("base64") },
    });

  if (chunkIndex < totalChunks - 1) {
    return NextResponse.json({ ok: true, received: chunkIndex });
  }

  // Last chunk received — assemble, persist and clean up.
  const parts = await db
    .select({ chunkIndex: uploadChunks.chunkIndex, data: uploadChunks.data })
    .from(uploadChunks)
    .where(eq(uploadChunks.uploadKey, uploadKey))
    .orderBy(asc(uploadChunks.chunkIndex));
  await db.delete(uploadChunks).where(eq(uploadChunks.uploadKey, uploadKey));
  // Leftovers of uploads abandoned halfway.
  await db
    .delete(uploadChunks)
    .where(sql`${uploadChunks.createdAt}::timestamptz < now() - interval '1 day'`)
    .catch(() => undefined);

  if (parts.length !== totalChunks || parts.some((p, i) => p.chunkIndex !== i)) {
    return NextResponse.json({ error: "Faltan partes del archivo, intenta de nuevo" }, { status: 400 });
  }
  const full = Buffer.concat(parts.map((p) => Buffer.from(p.data, "base64")));
  return saveAttachment(runCaseId, full, filename, mimeType, maxBytes);
}

async function saveAttachment(
  runCaseId: string,
  file: Buffer,
  filename: string,
  mimeType: string,
  maxBytes: number
): Promise<NextResponse> {
  if (file.length > maxBytes) {
    return NextResponse.json(
      { error: `El archivo es muy grande (máximo ${Math.round(maxBytes / 1024 / 1024)}MB)` },
      { status: 413 }
    );
  }
  try {
    const [attachment] = await db
      .insert(attachments)
      .values({ runCaseId, filename, data: file.toString("base64"), mimeType })
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
