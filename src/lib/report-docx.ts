import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ImageRun,
} from "docx";
import type { ReportData, ReportImage } from "./report-data";

const MAX_IMG_WIDTH = 500;
const MAX_IMG_HEIGHT = 380;

// docx's ImageRun needs explicit pixel dimensions upfront — unlike pdf-lib's
// embedPng/embedJpg, it doesn't read them from the file itself.
function getImageDimensions(buffer: Buffer, mimeType: string): { width: number; height: number } | null {
  try {
    if (mimeType === "image/png" && buffer.length >= 24) {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
      let offset = 2;
      while (offset + 4 <= buffer.length) {
        if (buffer[offset] !== 0xff) {
          offset++;
          continue;
        }
        const marker = buffer[offset + 1];
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
          offset += 2;
          continue;
        }
        const length = buffer.readUInt16BE(offset + 2);
        const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
        if (isSof && offset + 9 <= buffer.length) {
          return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
        }
        offset += 2 + length;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function scaledSize(width: number, height: number): { width: number; height: number } {
  const ratio = Math.min(MAX_IMG_WIDTH / width, MAX_IMG_HEIGHT / height, 1);
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

function imageParagraphs(images: ReportImage[]): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  for (const img of images) {
    const buffer = Buffer.from(img.base64, "base64");
    const dims = getImageDimensions(buffer, img.mimeType);
    if (!dims || !dims.width || !dims.height) continue;
    const type = img.mimeType === "image/png" ? "png" : "jpg";
    paragraphs.push(
      new Paragraph({
        children: [new ImageRun({ type, data: buffer, transformation: scaledSize(dims.width, dims.height) })],
        spacing: { after: 80 },
      })
    );
    paragraphs.push(
      new Paragraph({ children: [new TextRun({ text: img.filename, italics: true, size: 18 })], spacing: { after: 200 } })
    );
  }
  return paragraphs;
}

// Splits on "\n" so multi-line values (e.g. numbered steps) render as
// separate lines instead of running together — a plain Paragraph(string)
// ignores literal newlines.
function valueParagraph(value: string | number): Paragraph {
  const lines = String(value).split("\n");
  const children: TextRun[] = [];
  lines.forEach((line, i) => {
    if (i > 0) children.push(new TextRun({ text: "", break: 1 }));
    children.push(new TextRun({ text: line }));
  });
  return new Paragraph({ children });
}

function statsTable(rows: { label: string; value: string | number }[]): Table {
  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      new TableCell({
        width: { size: 70, type: WidthType.PERCENTAGE },
        shading: { fill: "0D9488" },
        children: [
          new Paragraph({ children: [new TextRun({ text: "Métrica", bold: true, color: "FFFFFF" })] }),
        ],
      }),
      new TableCell({
        width: { size: 30, type: WidthType.PERCENTAGE },
        shading: { fill: "0D9488" },
        children: [
          new Paragraph({ children: [new TextRun({ text: "Cantidad", bold: true, color: "FFFFFF" })] }),
        ],
      }),
    ],
  });

  const dataRows = rows.map(
    (r) =>
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph(r.label)] }),
          new TableCell({ children: [valueParagraph(r.value)] }),
        ],
      })
  );

  return new Table({ rows: [headerRow, ...dataRows], width: { size: 100, type: WidthType.PERCENTAGE } });
}

export function buildReportDocx(data: ReportData): Document {
  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: data.title, heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ text: data.subtitle, spacing: { after: 300 } }),
  ];
  for (const s of data.sections) {
    children.push(
      new Paragraph({ text: s.heading, heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 150 } })
    );
    children.push(statsTable(s.rows));
    if (s.images?.length) {
      children.push(
        new Paragraph({ text: "Evidencia", heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 } })
      );
      children.push(...imageParagraphs(s.images));
    }
  }
  return new Document({ sections: [{ children }] });
}

export function docToBuffer(doc: Document) {
  return Packer.toBuffer(doc);
}
