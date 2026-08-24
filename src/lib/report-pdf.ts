import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
import type { ReportData } from "./report-data";

const MARGIN = 50;
const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const LINE_HEIGHT = 13;
const ROW_PADDING = 9;
const FONT_SIZE = 10;
const COL_LABEL_WIDTH = 190;
const TABLE_WIDTH = PAGE_WIDTH - MARGIN * 2;
const CELL_PADDING = 8;

const TEAL = rgb(0.02, 0.44, 0.42);
const TEAL_LIGHT = rgb(0.91, 0.96, 0.95);
const TEXT = rgb(0.15, 0.2, 0.25);
const MUTED = rgb(0.45, 0.5, 0.55);

// The standard PDF fonts only support WinAnsi encoding — arrows, emoji, and
// other characters outside Latin-1 throw at draw time. Normalize the common
// ones and drop anything else rather than let the whole report fail.
function sanitizeForPdf(text: string): string {
  return String(text)
    .replace(/[→⇒➤]/g, "->")
    .replace(/[←⇐]/g, "<-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/•/g, "-")
    .replace(/[^\x00-\xFF]/g, "");
}

// pdf-lib doesn't expose its internal word-wrap helper, so lines are wrapped
// manually — needed to compute each row's height before drawing it.
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const paragraphs = sanitizeForPdf(text).split("\n");
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph === "") {
      lines.push("");
      continue;
    }
    const words = paragraph.split(" ");
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    lines.push(current);
  }
  return lines;
}

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

  page.drawText(sanitizeForPdf(data.title), { x: MARGIN, y, size: 18, font: boldFont, color: TEXT });
  y -= 24;
  page.drawText(sanitizeForPdf(data.subtitle), { x: MARGIN, y, size: 11, font, color: MUTED });
  y -= 30;

  const labelColWidth = COL_LABEL_WIDTH - CELL_PADDING * 2;
  const valueColWidth = TABLE_WIDTH - COL_LABEL_WIDTH - CELL_PADDING * 2;

  for (const section of data.sections) {
    ensureSpace(20 + LINE_HEIGHT + ROW_PADDING);
    const headingLines = wrapText(section.heading, boldFont, 13, TABLE_WIDTH);
    for (const line of headingLines) {
      ensureSpace(18);
      page.drawText(line, { x: MARGIN, y, size: 13, font: boldFont, color: TEAL });
      y -= 18;
    }
    y -= 2;

    ensureSpace(LINE_HEIGHT + ROW_PADDING);
    page.drawRectangle({
      x: MARGIN,
      y: y - LINE_HEIGHT - ROW_PADDING + LINE_HEIGHT,
      width: TABLE_WIDTH,
      height: LINE_HEIGHT + ROW_PADDING,
      color: TEAL,
    });
    page.drawText("Métrica", { x: MARGIN + CELL_PADDING, y: y - 2, size: FONT_SIZE, font: boldFont, color: rgb(1, 1, 1) });
    page.drawText("Cantidad", {
      x: MARGIN + COL_LABEL_WIDTH + CELL_PADDING,
      y: y - 2,
      size: FONT_SIZE,
      font: boldFont,
      color: rgb(1, 1, 1),
    });
    y -= LINE_HEIGHT + ROW_PADDING;

    section.rows.forEach((row, i) => {
      const labelLines = wrapText(row.label, font, FONT_SIZE, labelColWidth);
      const valueLines = wrapText(String(row.value), font, FONT_SIZE, valueColWidth);
      const lineCount = Math.max(labelLines.length, valueLines.length, 1);
      const rowHeight = lineCount * LINE_HEIGHT + ROW_PADDING;

      ensureSpace(rowHeight);
      if (i % 2 === 1) {
        page.drawRectangle({
          x: MARGIN,
          y: y - rowHeight + LINE_HEIGHT,
          width: TABLE_WIDTH,
          height: rowHeight,
          color: TEAL_LIGHT,
        });
      }
      labelLines.forEach((line, li) => {
        page.drawText(line, {
          x: MARGIN + CELL_PADDING,
          y: y - 2 - li * LINE_HEIGHT,
          size: FONT_SIZE,
          font,
          color: TEXT,
        });
      });
      valueLines.forEach((line, li) => {
        page.drawText(line, {
          x: MARGIN + COL_LABEL_WIDTH + CELL_PADDING,
          y: y - 2 - li * LINE_HEIGHT,
          size: FONT_SIZE,
          font,
          color: TEXT,
        });
      });
      y -= rowHeight;
    });

    y -= 16;
  }

  return pdfDoc.save();
}
