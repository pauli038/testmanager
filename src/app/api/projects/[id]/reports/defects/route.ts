import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/require-auth";
import { getDefectsReportData } from "@/lib/report-data";
import { buildReportDocx, docToBuffer } from "@/lib/report-docx";
import { buildReportPdf } from "@/lib/report-pdf";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || undefined;
  const format = searchParams.get("format") === "pdf" ? "pdf" : "docx";

  let data;
  try {
    data = await getDefectsReportData(id, date);
  } catch {
    return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  }

  if (format === "pdf") {
    const bytes = await buildReportPdf(data);
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${data.filenameBase}.pdf"`,
      },
    });
  }

  const buffer = await docToBuffer(buildReportDocx(data));
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${data.filenameBase}.docx"`,
    },
  });
}
