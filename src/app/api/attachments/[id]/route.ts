import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { attachments } from "@/db/schema";
import { requireUser } from "@/lib/require-auth";
import { deleteObjects, signedUrl } from "@/lib/storage";
import { eq } from "drizzle-orm";

// Serves the raw file so list/detail endpoints can reference attachments by
// URL instead of embedding their base64 data inline — a run or defect with
// several images (or a large video) easily blows past Vercel's ~4.5MB
// response-size limit for a Serverless Function if that data is inlined.
// Files in the storage bucket are a redirect to a short-lived signed link.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  const attachment = await db.query.attachments.findFirst({
    where: eq(attachments.id, id),
    columns: { data: true, storagePath: true, mimeType: true, filename: true },
  });
  if (!attachment) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  if (attachment.storagePath) {
    return NextResponse.redirect(await signedUrl(attachment.storagePath, 60 * 60), {
      // Shorter than the link's life, so a cached redirect never points to an expired one.
      headers: { "Cache-Control": "private, max-age=600" },
    });
  }
  return new NextResponse(Buffer.from(attachment.data ?? "", "base64"), {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Disposition": `inline; filename="${attachment.filename}"`,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  const [deleted] = await db
    .delete(attachments)
    .where(eq(attachments.id, id))
    .returning({ storagePath: attachments.storagePath });
  if (deleted?.storagePath) {
    // The row is already gone; a file left behind only takes space.
    await deleteObjects([deleted.storagePath]).catch((err) =>
      console.error("No se pudo borrar el archivo del bucket:", err)
    );
  }
  return NextResponse.json({ ok: true });
}
