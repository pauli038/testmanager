import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
import type { ReportData } from "./report-data";
import { chartHeight, drawChart, sanitizeForPdf } from "./report-charts";

const MARGIN = 50;
const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const LINE_HEIGHT = 13;
const ROW_PADDING = 9;
const FONT_SIZE = 10;
const COL_LABEL_WIDTH = 190;
const TABLE_WIDTH = PAGE_WIDTH - MARGIN * 2;
const CELL_PADDING = 8;
const MAX_IMG_HEIGHT = 320;

const TEAL = rgb(0.02, 0.44, 0.42);
const TEAL_LIGHT = rgb(0.91, 0.96, 0.95);
const TEXT = rgb(0.15, 0.2, 0.25);
const MUTED = rgb(0.45, 0.5, 0.55);

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
    // Keep the heading on the same page as whatever follows it.
    const firstChart = section.charts?.[0];
    ensureSpace(20 + (firstChart ? chartHeight(firstChart, font, TABLE_WIDTH) : LINE_HEIGHT + ROW_PADDING));
    const headingLines = wrapText(section.heading, boldFont, 13, TABLE_WIDTH);
    for (const line of headingLines) {
      ensureSpace(18);
      page.drawText(line, { x: MARGIN, y, size: 13, font: boldFont, color: TEAL });
      y -= 18;
    }
    y -= 2;

    for (const chart of section.charts ?? []) {
      const height = chartHeight(chart, font, TABLE_WIDTH);
      ensureSpace(height);
      drawChart({ page, font, boldFont, x: MARGIN, y, width: TABLE_WIDTH }, chart);
      // The table header is drawn partly above `y`, so leave room for it.
      y -= height + 22;
    }

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

    for (const img of section.images ?? []) {
      try {
        // A plain Buffer.from(base64, "base64") can be a view into Node's
        // shared allocation pool with a non-zero byteOffset; pdf-lib's JPEG
        // embedder reads via `.buffer` directly and ignores that offset,
        // misreading the SOI marker. Copying into a fresh Uint8Array avoids it.
        const bytes = new Uint8Array(Buffer.from(img.base64, "base64"));
        const embedded = img.mimeType === "image/png" ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
        const scale = Math.min(TABLE_WIDTH / embedded.width, MAX_IMG_HEIGHT / embedded.height, 1);
        const w = embedded.width * scale;
        const h = embedded.height * scale;

        ensureSpace(h + LINE_HEIGHT + 10);
        page.drawImage(embedded, { x: MARGIN, y: y - h, width: w, height: h });
        y -= h + 4;

        for (const line of wrapText(img.filename, font, 8, TABLE_WIDTH)) {
          ensureSpace(10);
          page.drawText(line, { x: MARGIN, y, size: 8, font, color: MUTED });
          y -= 10;
        }
        y -= 6;
      } catch (err) {
        console.error("Failed to embed image in PDF report:", err);
      }
    }

    y -= 16;
  }

  return pdfDoc.save();
}
