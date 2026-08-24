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
} from "docx";
import type { ReportData } from "./report-data";

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
  }
  return new Document({ sections: [{ children }] });
}

export function docToBuffer(doc: Document) {
  return Packer.toBuffer(doc);
}
