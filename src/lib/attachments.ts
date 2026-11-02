import { db } from "@/db";
import { attachments } from "@/db/schema";
import { deleteObjects, downloadObject, storageEnabled, uploadObject } from "./storage";

// Saves an evidence file: in the storage bucket when it's configured,
// otherwise as base64 in the database. The object is uploaded before the row
// is written, so a row never points to a file that isn't there.
export async function saveAttachment(file: {
  runCaseId?: string;
  defectId?: string;
  retestId?: string | null;
  filename: string;
  mimeType: string;
  data: Buffer;
}) {
  const { data, ...fields } = file;
  if (!storageEnabled()) {
    const [row] = await db
      .insert(attachments)
      .values({ ...fields, data: data.toString("base64") })
      .returning();
    return row;
  }

  const id = crypto.randomUUID();
  const storagePath = id;
  await uploadObject(storagePath, data, file.mimeType);
  try {
    const [row] = await db.insert(attachments).values({ ...fields, id, storagePath }).returning();
    return row;
  } catch (err) {
    await deleteObjects([storagePath]).catch(() => undefined);
    throw err;
  }
}

// The file's bytes, wherever they are stored.
export async function readAttachment(a: { storagePath: string | null; data: string | null }) {
  if (a.storagePath) return downloadObject(a.storagePath);
  return Buffer.from(a.data ?? "", "base64");
}
