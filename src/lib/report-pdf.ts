import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ReportData } from "./report-data";

const MARGIN = 50;
const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const ROW_HEIGHT = 22;
const COL_LABEL_WIDTH = 330;
const TABLE_WIDTH = PAGE_WIDTH - MARGIN * 2;

const TEAL = rgb(0.02, 0.44, 0.42);
const TEAL_LIGHT = rgb(0.91, 0.96, 0.95);
const TEXT = rgb(0.15, 0.2, 0.25);
const MUTED = rgb(0.45, 0.5, 0.55);

export async function buildReportPdf(data: ReportData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function ensureSpace(height: number) {
    if (y - height < MARGIN) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  }

  page.drawText(data.title, { x: MARGIN, y, size: 18, font: boldFont, color: TEXT });
  y -= 24;
  page.drawText(data.subtitle, { x: MARGIN, y, size: 11, font, color: MUTED });
  y -= 30;

  for (const section of data.sections) {
    ensureSpace(20 + ROW_HEIGHT);
    page.drawText(section.heading, { x: MARGIN, y, size: 13, font: boldFont, color: TEAL });
    y -= 20;

    ensureSpace(ROW_HEIGHT);
    page.drawRectangle({ x: MARGIN, y: y - ROW_HEIGHT + 6, width: TABLE_WIDTH, height: ROW_HEIGHT, color: TEAL });
    page.drawText("Métrica", { x: MARGIN + 8, y: y - 10, size: 10, font: boldFont, color: rgb(1, 1, 1) });
    page.drawText("Cantidad", {
      x: MARGIN + COL_LABEL_WIDTH + 8,
      y: y - 10,
      size: 10,
      font: boldFont,
      color: rgb(1, 1, 1),
    });
    y -= ROW_HEIGHT;

    section.rows.forEach((row, i) => {
      ensureSpace(ROW_HEIGHT);
      if (i % 2 === 1) {
        page.drawRectangle({
          x: MARGIN,
          y: y - ROW_HEIGHT + 6,
          width: TABLE_WIDTH,
          height: ROW_HEIGHT,
          color: TEAL_LIGHT,
        });
      }
      page.drawText(row.label, { x: MARGIN + 8, y: y - 10, size: 10, font, color: TEXT });
      page.drawText(String(row.value), {
        x: MARGIN + COL_LABEL_WIDTH + 8,
        y: y - 10,
        size: 10,
        font,
        color: TEXT,
      });
      y -= ROW_HEIGHT;
    });

    y -= 16;
  }

  return pdfDoc.save();
}
