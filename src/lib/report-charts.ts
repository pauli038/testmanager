import { PDFFont, PDFPage, StandardFontEmbedder, StandardFonts, rgb } from "pdf-lib";

// Charts for the reports, drawn as vector shapes so the server never needs a
// browser or system fonts. The same drawing code targets the PDF (pdf-lib)
// and Word (an SVG image) through the small Painter interface below.

export type ChartLegendItem = { label: string; color: string };

export type ReportChart =
  | {
      // Line chart over days; optional bars use their own scale (right axis).
      type: "lines";
      title: string;
      labels: string[];
      series: { label: string; color: string; values: (number | null)[]; dashed?: boolean; area?: boolean }[];
      bars?: { label: string; color: string; values: (number | null)[] };
      yMax?: number;
      ySuffix?: string;
    }
  | {
      // One horizontal stacked bar per row.
      type: "stackedBars";
      title: string;
      rows: { label: string; segments: { value: number; color: string }[] }[];
      legend: ChartLegendItem[];
    }
  | { type: "donut"; title: string; slices: { label: string; value: number; color: string }[] }
  | { type: "squares"; title: string; colors: string[]; legend: ChartLegendItem[] };

type Point = { x: number; y: number };

// Coordinates are PDF-style: y grows upwards. Colors are "#rrggbb".
interface Painter {
  rect(x: number, y: number, w: number, h: number, color: string, opacity?: number): void;
  line(from: Point, to: Point, color: string, thickness: number, dash?: number[]): void;
  circle(c: Point, r: number, color: string): void;
  polygon(points: Point[], color: string, opts?: { opacity?: number; stroke?: string; strokeWidth?: number }): void;
  text(text: string, x: number, y: number, size: number, color: string, bold?: boolean): void;
  textWidth(text: string, size: number, bold?: boolean): number;
}

type Ctx = { p: Painter; x: number; y: number; width: number };

const AXIS_TEXT = "#64748b";
const GRID = "#e2e8f0";
const TITLE_TEXT = "#26333f";
const TITLE_SIZE = 10;
const AXIS_SIZE = 7;
const LEGEND_SIZE = 8;
const LEGEND_HEIGHT = 14;

const LINE_PLOT_HEIGHT = 130;
const BAR_ROW_HEIGHT = 18;
const DONUT_SIZE = 120;
const SQUARE = 9;
const SQUARE_GAP = 3;

// The standard PDF fonts only support WinAnsi encoding — arrows, emoji, and
// other characters outside Latin-1 throw at draw time. Normalize the common
// ones and drop anything else rather than let the whole report fail.
export function sanitizeForPdf(text: string): string {
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

// Rounds the axis maximum up to 1/2/5 × 10^n so gridlines land on round numbers.
function niceMax(max: number): number {
  if (max <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(max)));
  for (const m of [1, 2, 5, 10]) if (m * exp >= max) return m * exp;
  return 10 * exp;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function legendWidth(p: Painter, item: ChartLegendItem) {
  return 14 + p.textWidth(item.label, LEGEND_SIZE) + 12;
}

function legendHeight(p: Painter, items: ChartLegendItem[], width: number): number {
  let rows = 1;
  let lineX = 0;
  for (const item of items) {
    const w = legendWidth(p, item);
    if (lineX + w > width && lineX > 0) {
      rows++;
      lineX = 0;
    }
    lineX += w;
  }
  return items.length ? rows * LEGEND_HEIGHT : 0;
}

function drawLegend(ctx: Ctx, items: ChartLegendItem[], top: number) {
  let lineX = 0;
  let lineY = top;
  for (const item of items) {
    const w = legendWidth(ctx.p, item);
    if (lineX + w > ctx.width && lineX > 0) {
      lineX = 0;
      lineY -= LEGEND_HEIGHT;
    }
    ctx.p.rect(ctx.x + lineX, lineY - 8, 9, 9, item.color);
    ctx.p.text(item.label, ctx.x + lineX + 14, lineY - 7, LEGEND_SIZE, AXIS_TEXT);
    lineX += w;
  }
}

function legendFor(chart: ReportChart): ChartLegendItem[] {
  switch (chart.type) {
    case "lines":
      return [
        ...(chart.bars ? [{ label: chart.bars.label, color: chart.bars.color }] : []),
        ...chart.series.map((s) => ({ label: s.label, color: s.color })),
      ];
    case "donut":
      return []; // listed beside the donut instead
    default:
      return chart.legend;
  }
}

function measureChart(p: Painter, chart: ReportChart, width: number): number {
  const header = TITLE_SIZE + 10;
  const legend = legendHeight(p, legendFor(chart), width) + 6;
  switch (chart.type) {
    case "lines":
      return header + LINE_PLOT_HEIGHT + 14 + legend;
    case "stackedBars":
      return header + chart.rows.length * BAR_ROW_HEIGHT + legend;
    case "donut":
      return header + DONUT_SIZE + 8;
    case "squares": {
      const perRow = Math.max(1, Math.floor((width + SQUARE_GAP) / (SQUARE + SQUARE_GAP)));
      return header + Math.ceil(chart.colors.length / perRow) * (SQUARE + SQUARE_GAP) + 6 + legend;
    }
  }
}

function paintChart(ctx: Ctx, chart: ReportChart) {
  ctx.p.text(chart.title, ctx.x, ctx.y - TITLE_SIZE, TITLE_SIZE, TITLE_TEXT, true);
  const top = ctx.y - TITLE_SIZE - 10;
  switch (chart.type) {
    case "lines":
      return paintLines(ctx, chart, top);
    case "stackedBars":
      return paintStackedBars(ctx, chart, top);
    case "donut":
      return paintDonut(ctx, chart, top);
    case "squares":
      return paintSquares(ctx, chart, top);
  }
}

function paintLines(ctx: Ctx, chart: Extract<ReportChart, { type: "lines" }>, top: number) {
  const { p } = ctx;
  const suffix = chart.ySuffix ?? "";
  const leftAxis = 28;
  const rightAxis = chart.bars ? 22 : 4;
  const plotX = ctx.x + leftAxis;
  const plotW = ctx.width - leftAxis - rightAxis;
  const plotBottom = top - LINE_PLOT_HEIGHT;
  const n = Math.max(1, chart.labels.length);
  const slot = plotW / n;
  const xAt = (i: number) => plotX + slot * (i + 0.5);

  const allValues = chart.series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  const yMax = chart.yMax ?? niceMax(Math.max(0, ...allValues));
  const yAt = (v: number) => plotBottom + (v / yMax) * LINE_PLOT_HEIGHT;

  const TICKS = 4;
  for (let t = 0; t <= TICKS; t++) {
    const v = (yMax / TICKS) * t;
    const y = yAt(v);
    p.line({ x: plotX, y }, { x: plotX + plotW, y }, GRID, 0.5);
    const label = `${fmt(v)}${suffix}`;
    p.text(label, plotX - 4 - p.textWidth(label, AXIS_SIZE), y - 2.5, AXIS_SIZE, AXIS_TEXT);
  }

  // Bars sit behind the lines, scaled to their own maximum (labeled on the right).
  if (chart.bars) {
    const bars = chart.bars;
    const barValues = bars.values.filter((v): v is number => v !== null);
    const barMax = niceMax(Math.max(0, ...barValues));
    const barW = Math.min(8, slot * 0.6);
    bars.values.forEach((v, i) => {
      if (!v) return;
      p.rect(xAt(i) - barW / 2, plotBottom, barW, (v / barMax) * LINE_PLOT_HEIGHT, bars.color, 0.7);
    });
    for (let t = 0; t <= TICKS; t++) {
      p.text(fmt((barMax / TICKS) * t), plotX + plotW + 4, yAt((yMax / TICKS) * t) - 2.5, AXIS_SIZE, AXIS_TEXT);
    }
  }

  for (const s of chart.series) {
    const points = s.values
      .map((v, i) => (v === null ? null : { x: xAt(i), y: yAt(Math.min(v, yMax)) }))
      .filter((pt): pt is Point => pt !== null);
    if (!points.length) continue;

    if (s.area && points.length > 1) {
      p.polygon(
        [{ x: points[0].x, y: plotBottom }, ...points, { x: points[points.length - 1].x, y: plotBottom }],
        s.color,
        { opacity: 0.15 }
      );
    }
    for (let i = 1; i < points.length; i++) {
      p.line(points[i - 1], points[i], s.color, 1.5, s.dashed ? [4, 3] : undefined);
    }
    if (!s.dashed && points.length <= 31) {
      for (const pt of points) p.circle(pt, 1.6, s.color);
    }
  }

  // X labels: dd/mm, thinned out so they don't overlap.
  const labelW = p.textWidth("00/00", AXIS_SIZE) + 6;
  const every = Math.max(1, Math.ceil(labelW / slot));
  chart.labels.forEach((label, i) => {
    if (i % every !== 0) return;
    const text = `${label.slice(8, 10)}/${label.slice(5, 7)}`;
    p.text(text, xAt(i) - p.textWidth(text, AXIS_SIZE) / 2, plotBottom - 10, AXIS_SIZE, AXIS_TEXT);
  });
  p.line({ x: plotX, y: plotBottom }, { x: plotX + plotW, y: plotBottom }, AXIS_TEXT, 0.7);

  drawLegend(ctx, legendFor(chart), plotBottom - 20);
}

function paintStackedBars(ctx: Ctx, chart: Extract<ReportChart, { type: "stackedBars" }>, top: number) {
  const { p } = ctx;
  const labelW = Math.min(150, ctx.width * 0.32);
  const totalW = 46;
  const barX = ctx.x + labelW + 6;
  const barW = ctx.width - labelW - 6 - totalW;

  chart.rows.forEach((row, i) => {
    const y = top - i * BAR_ROW_HEIGHT - 12;
    let label = row.label;
    if (p.textWidth(label, LEGEND_SIZE) > labelW) {
      while (label.length > 1 && p.textWidth(label + "...", LEGEND_SIZE) > labelW) label = label.slice(0, -1);
      label += "...";
    }
    p.text(label, ctx.x, y + 2, LEGEND_SIZE, TITLE_TEXT);

    const total = row.segments.reduce((a, s) => a + s.value, 0);
    p.rect(barX, y, barW, 10, GRID);
    let offset = 0;
    for (const seg of row.segments) {
      if (!seg.value || !total) continue;
      const w = (seg.value / total) * barW;
      p.rect(barX + offset, y, w, 10, seg.color);
      offset += w;
    }
    p.text(String(total), barX + barW + 6, y + 2, LEGEND_SIZE, AXIS_TEXT);
  });

  drawLegend(ctx, chart.legend, top - chart.rows.length * BAR_ROW_HEIGHT - 4);
}

function paintDonut(ctx: Ctx, chart: Extract<ReportChart, { type: "donut" }>, top: number) {
  const { p } = ctx;
  const r = DONUT_SIZE / 2;
  const inner = r * 0.6;
  const cx = ctx.x + r;
  const cy = top - r;
  const total = chart.slices.reduce((a, s) => a + s.value, 0);

  if (total === 0) {
    p.circle({ x: cx, y: cy }, r, GRID);
  } else {
    // Slices are polygons approximating the arc, which every backend can draw.
    let angle = 0;
    for (const slice of chart.slices) {
      if (!slice.value) continue;
      const sweep = (slice.value / total) * Math.PI * 2;
      const steps = Math.max(2, Math.ceil(sweep / 0.05));
      const outer: Point[] = [];
      const innerPts: Point[] = [];
      for (let k = 0; k <= steps; k++) {
        const a = angle + (sweep * k) / steps;
        outer.push({ x: cx + r * Math.sin(a), y: cy + r * Math.cos(a) });
        innerPts.push({ x: cx + inner * Math.sin(a), y: cy + inner * Math.cos(a) });
      }
      p.polygon([...outer, ...innerPts.reverse()], slice.color, { stroke: "#ffffff", strokeWidth: 0.8 });
      angle += sweep;
    }
  }
  const totalText = String(total);
  p.text(totalText, cx - p.textWidth(totalText, 14, true) / 2, cy - 2, 14, TITLE_TEXT, true);
  p.text("casos", cx - p.textWidth("casos", AXIS_SIZE) / 2, cy - 11, AXIS_SIZE, AXIS_TEXT);

  // Legend to the right of the donut, one entry per line.
  const legendX = ctx.x + DONUT_SIZE + 24;
  chart.slices
    .filter((s) => s.value > 0)
    .forEach((slice, i) => {
      const y = top - 18 - i * LEGEND_HEIGHT;
      p.rect(legendX, y - 1, 9, 9, slice.color);
      const text = `${slice.label}: ${slice.value} (${Math.round((slice.value / total) * 100)}%)`;
      p.text(text, legendX + 14, y, LEGEND_SIZE, TITLE_TEXT);
    });
}

function paintSquares(ctx: Ctx, chart: Extract<ReportChart, { type: "squares" }>, top: number) {
  const perRow = Math.max(1, Math.floor((ctx.width + SQUARE_GAP) / (SQUARE + SQUARE_GAP)));
  chart.colors.forEach((color, i) => {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    ctx.p.rect(ctx.x + col * (SQUARE + SQUARE_GAP), top - row * (SQUARE + SQUARE_GAP) - SQUARE, SQUARE, SQUARE, color);
  });
  const rows = Math.ceil(chart.colors.length / perRow);
  drawLegend(ctx, chart.legend, top - rows * (SQUARE + SQUARE_GAP) - 6);
}

// ---------- PDF backend ----------

function hexRgb(color: string) {
  const n = parseInt(color.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

// pdf-lib's SVG paths use a y-down coordinate system with origin at (x, y);
// drawing with origin (0, 0) means a PDF point (px, py) is (px, -py) in SVG.
const pdfPath = (points: Point[]) =>
  "M " + points.map((pt) => `${pt.x.toFixed(2)},${(-pt.y).toFixed(2)}`).join(" L ") + " Z";

function pdfPainter(page: PDFPage, font: PDFFont, boldFont: PDFFont): Painter {
  const f = (bold?: boolean) => (bold ? boldFont : font);
  return {
    rect: (x, y, width, height, color, opacity) => page.drawRectangle({ x, y, width, height, color: hexRgb(color), opacity }),
    line: (start, end, color, thickness, dashArray) => page.drawLine({ start, end, thickness, color: hexRgb(color), dashArray }),
    circle: (c, size, color) => page.drawCircle({ x: c.x, y: c.y, size, color: hexRgb(color) }),
    polygon: (points, color, opts = {}) =>
      page.drawSvgPath(pdfPath(points), {
        x: 0,
        y: 0,
        color: hexRgb(color),
        opacity: opts.opacity,
        borderColor: opts.stroke ? hexRgb(opts.stroke) : undefined,
        borderWidth: opts.strokeWidth ?? 0,
      }),
    text: (text, x, y, size, color, bold) =>
      page.drawText(sanitizeForPdf(text), { x, y, size, font: f(bold), color: hexRgb(color) }),
    textWidth: (text, size, bold) => f(bold).widthOfTextAtSize(sanitizeForPdf(text), size),
  };
}

export function chartHeight(chart: ReportChart, font: PDFFont, width: number): number {
  const measure = { textWidth: (t: string, size: number) => font.widthOfTextAtSize(sanitizeForPdf(t), size) } as Painter;
  return measureChart(measure, chart, width);
}

export function drawChart(
  target: { page: PDFPage; font: PDFFont; boldFont: PDFFont; x: number; y: number; width: number },
  chart: ReportChart
) {
  paintChart({ p: pdfPainter(target.page, target.font, target.boldFont), x: target.x, y: target.y, width: target.width }, chart);
}

// ---------- SVG backend (Word) ----------

// Text is measured with Helvetica's metrics; Word renders it with Helvetica or
// Arial, which share them.
// (pdf-lib types `for` with its internal font-name enum; the values match.)
type EmbedderFont = Parameters<typeof StandardFontEmbedder.for>[0];
const helvetica = StandardFontEmbedder.for(StandardFonts.Helvetica as unknown as EmbedderFont);
const helveticaBold = StandardFontEmbedder.for(StandardFonts.HelveticaBold as unknown as EmbedderFont);

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n2 = (v: number) => Number(v.toFixed(2));

export function chartToSvg(chart: ReportChart, width: number): { svg: string; width: number; height: number } {
  const els: string[] = [];
  let height = 0;
  const sy = (y: number) => n2(height - y);
  const painter: Painter = {
    rect: (x, y, w, h, color, opacity) =>
      els.push(
        `<rect x="${n2(x)}" y="${sy(y + h)}" width="${n2(w)}" height="${n2(h)}" fill="${color}"${
          opacity !== undefined ? ` fill-opacity="${opacity}"` : ""
        }/>`
      ),
    line: (a, b, color, thickness, dash) =>
      els.push(
        `<line x1="${n2(a.x)}" y1="${sy(a.y)}" x2="${n2(b.x)}" y2="${sy(b.y)}" stroke="${color}" stroke-width="${thickness}"${
          dash ? ` stroke-dasharray="${dash.join(" ")}"` : ""
        }/>`
      ),
    circle: (c, r, color) => els.push(`<circle cx="${n2(c.x)}" cy="${sy(c.y)}" r="${r}" fill="${color}"/>`),
    polygon: (points, color, opts = {}) =>
      els.push(
        `<polygon points="${points.map((pt) => `${n2(pt.x)},${sy(pt.y)}`).join(" ")}" fill="${color}"${
          opts.opacity !== undefined ? ` fill-opacity="${opts.opacity}"` : ""
        }${opts.stroke ? ` stroke="${opts.stroke}" stroke-width="${opts.strokeWidth ?? 1}"` : ""}/>`
      ),
    text: (text, x, y, size, color, bold) =>
      els.push(
        `<text x="${n2(x)}" y="${sy(y)}" font-size="${size}" fill="${color}"${
          bold ? ` font-weight="bold"` : ""
        }>${escapeXml(text)}</text>`
      ),
    textWidth: (text, size, bold) => (bold ? helveticaBold : helvetica).widthOfTextAtSize(sanitizeForPdf(text), size),
  };

  height = Math.ceil(measureChart(painter, chart, width));
  paintChart({ p: painter, x: 0, y: height, width }, chart);

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" ` +
    `font-family="Helvetica, Arial, sans-serif"><rect width="100%" height="100%" fill="#ffffff"/>${els.join("")}</svg>`;
  return { svg, width, height };
}
