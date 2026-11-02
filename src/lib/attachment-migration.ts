import { createHash } from "node:crypto";
import { db } from "../db";
import { attachments } from "../db/schema";
import { and, asc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { downloadObject, uploadObject } from "./storage";

// Moving evidence from the database (base64 in attachments.data) to the
// storage bucket, in two verified steps. Used by
// scripts/migrate-attachments-to-storage.ts and the admin page.
//   copy:  upload, download back and compare SHA-256; only then the row gets
//          its storage_path. The database copy stays.
//   clear: compare the bucket file with the database copy again and only
//          then empty `data`. A mismatch is uploaded again; if it still
//          doesn't match, the row is unmarked so the database copy is served.
export type MigrationStep = "copy" | "clear";
export type MigrationResult = { id: string; filename: string; ok: boolean; message?: string };

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

export async function migrationSummary() {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      dbOnly: sql<number>`(count(*) filter (where ${attachments.storagePath} is null))::int`,
      both: sql<number>`(count(*) filter (where ${attachments.storagePath} is not null and ${attachments.data} is not null))::int`,
      bucketOnly: sql<number>`(count(*) filter (where ${attachments.storagePath} is not null and ${attachments.data} is null))::int`,
      dbBytes: sql<number>`(coalesce(sum(length(${attachments.data})), 0) * 3 / 4)::bigint`,
    })
    .from(attachments);
  return { ...row, dbBytes: Number(row.dbBytes) };
}

// Next ids waiting for `step`, after `after` (ids are walked in order, so a
// file that failed isn't retried in the same pass).
export async function pendingIds(step: MigrationStep, after: string, limit: number) {
  const where =
    step === "copy"
      ? and(isNull(attachments.storagePath), isNotNull(attachments.data))
      : and(isNotNull(attachments.storagePath), isNotNull(attachments.data));
  const rows = await db
    .select({ id: attachments.id })
    .from(attachments)
    .where(and(where, gt(attachments.id, after)))
    .orderBy(asc(attachments.id))
    .limit(limit);
  return rows.map((r) => r.id);
}

export async function migrateOne(step: MigrationStep, id: string): Promise<MigrationResult | null> {
  const row = await db.query.attachments.findFirst({ where: eq(attachments.id, id) });
  if (!row?.data) return null;
  const original = Buffer.from(row.data, "base64");
  const result = { id, filename: row.filename };
  try {
    if (step === "copy") {
      if (row.storagePath) return null;
      await uploadObject(id, original, row.mimeType);
      if (sha256(await downloadObject(id)) !== sha256(original)) {
        throw new Error("la copia del bucket no coincide");
      }
      await db
        .update(attachments)
        .set({ storagePath: id })
        .where(and(eq(attachments.id, id), isNull(attachments.storagePath)));
      return { ...result, ok: true };
    }

    if (!row.storagePath) return null;
    let message: string | undefined;
    if (sha256(await downloadObject(row.storagePath)) !== sha256(original)) {
      await uploadObject(row.storagePath, original, row.mimeType);
      if (sha256(await downloadObject(row.storagePath)) !== sha256(original)) {
        await db.update(attachments).set({ storagePath: null }).where(eq(attachments.id, id));
        throw new Error("el archivo del bucket no coincide; se sigue sirviendo desde la base de datos");
      }
      message = "la copia del bucket no coincidía, se volvió a subir";
    }
    await db.update(attachments).set({ data: null }).where(eq(attachments.id, id));
    return { ...result, ok: true, message };
  } catch (err) {
    return { ...result, ok: false, message: (err as Error).message };
  }
}
