import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { attachments } from "@/db/schema";
import { requireUser } from "@/lib/require-auth";
import { eq } from "drizzle-orm";

// Serves the raw file so list/detail endpoints can reference attachments by
// URL instead of embedding their base64 data inline — a run or defect with
// several images (or a large video) easily blows past Vercel's ~4.5MB
// response-size limit for a Serverless Function if that data is inlined.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  const attachment = await db.query.attachments.findFirst({
    where: eq(attachments.id, id),
    columns: { data: true, mimeType: true, filename: true },
  });
  if (!attachment) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  return new NextResponse(Buffer.from(attachment.data, "base64"), {
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
  await db.delete(attachments).where(eq(attachments.id, id));
  return NextResponse.json({ ok: true });
}
