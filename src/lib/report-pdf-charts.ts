import { PDFFont, PDFPage, rgb, type RGB } from "pdf-lib";

// Charts drawn as vector shapes with pdf-lib, so the PDF report can show the
// same graphs as the dashboard without rendering images on the server.

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

export type ChartContext = {
  page: PDFPage;
  font: PDFFont;
  boldFont: PDFFont;
  x: number;
  y: number; // top of the chart
  width: number;
  // Normalizes text to what the standard PDF fonts can encode.
  sanitize: (text: string) => string;
};

const AXIS_TEXT = rgb(0.39, 0.45, 0.55);
const GRID = rgb(0.89, 0.91, 0.94);
const TITLE_TEXT = rgb(0.15, 0.2, 0.25);
const TITLE_SIZE = 10;
const AXIS_SIZE = 7;
const LEGEND_SIZE = 8;
const LEGEND_HEIGHT = 14;

const LINE_PLOT_HEIGHT = 130;
const BAR_ROW_HEIGHT = 18;
const DONUT_SIZE = 120;
const SQUARE = 9;
const SQUARE_GAP = 3;

function hex(color: string): RGB {
  const n = parseInt(color.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

// Rounds the axis maximum up to 1/2/5 × 10^n so gridlines land on round numbers.
function niceMax(max: number): number {
  if (max <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(max)));
  for (const m of [1, 2, 5, 10]) if (m * exp >= max) return m * exp;
  return 10 * exp;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

// pdf-lib's SVG paths use a y-down coordinate system with origin at (x, y);
// drawing with origin (0, 0) means a PDF point (px, py) is (px, -py) in SVG.
const svgPoint = (px: number, py: number) => `${px.toFixed(2)},${(-py).toFixed(2)}`;

function legendHeight(items: ChartLegendItem[], font: PDFFont, width: number): number {
  let rows = 1;
  let lineX = 0;
  for (const item of items) {
    const w = 14 + font.widthOfTextAtSize(item.label, LEGEND_SIZE) + 12;
    if (lineX + w > width && lineX > 0) {
      rows++;
      lineX = 0;
    }
    lineX += w;
  }
  return items.length ? rows * LEGEND_HEIGHT : 0;
}

function drawLegend(ctx: ChartContext, items: ChartLegendItem[], top: number) {
  let lineX = 0;
  let lineY = top;
  for (const item of items) {
    const label = ctx.sanitize(item.label);
    const w = 14 + ctx.font.widthOfTextAtSize(label, LEGEND_SIZE) + 12;
    if (lineX + w > ctx.width && lineX > 0) {
      lineX = 0;
      lineY -= LEGEND_HEIGHT;
    }
    ctx.page.drawRectangle({ x: ctx.x + lineX, y: lineY - 8, width: 9, height: 9, color: hex(item.color) });
    ctx.page.drawText(label, {
      x: ctx.x + lineX + 14,
      y: lineY - 7,
      size: LEGEND_SIZE,
      font: ctx.font,
      color: AXIS_TEXT,
    });
    lineX += w;
  }
}

function drawTitle(ctx: ChartContext, title: string) {
  ctx.page.drawText(ctx.sanitize(title), { x: ctx.x, y: ctx.y - TITLE_SIZE, size: TITLE_SIZE, font: ctx.boldFont, color: TITLE_TEXT });
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

export function chartHeight(chart: ReportChart, font: PDFFont, width: number): number {
  const header = TITLE_SIZE + 10;
  const legend = legendHeight(legendFor(chart), font, width) + 6;
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

export function drawChart(ctx: ChartContext, chart: ReportChart) {
  drawTitle(ctx, chart.title);
  const top = ctx.y - TITLE_SIZE - 10;
  switch (chart.type) {
    case "lines":
      return drawLines(ctx, chart, top);
    case "stackedBars":
      return drawStackedBars(ctx, chart, top);
    case "donut":
      return drawDonut(ctx, chart, top);
    case "squares":
      return drawSquares(ctx, chart, top);
  }
}

function drawLines(ctx: ChartContext, chart: Extract<ReportChart, { type: "lines" }>, top: number) {
  const { page, font } = ctx;
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
    page.drawLine({ start: { x: plotX, y }, end: { x: plotX + plotW, y }, thickness: 0.5, color: GRID });
    const label = `${fmt(v)}${suffix}`;
    page.drawText(label, {
      x: plotX - 4 - font.widthOfTextAtSize(label, AXIS_SIZE),
      y: y - 2.5,
      size: AXIS_SIZE,
      font,
      color: AXIS_TEXT,
    });
  }

  // Bars sit behind the lines, scaled to their own maximum (labeled on the right).
  if (chart.bars) {
    const barValues = chart.bars.values.filter((v): v is number => v !== null);
    const barMax = niceMax(Math.max(0, ...barValues));
    const barW = Math.min(8, slot * 0.6);
    chart.bars.values.forEach((v, i) => {
      if (!v) return;
      page.drawRectangle({
        x: xAt(i) - barW / 2,
        y: plotBottom,
        width: barW,
        height: (v / barMax) * LINE_PLOT_HEIGHT,
        color: hex(chart.bars!.color),
        opacity: 0.7,
      });
    });
    for (let t = 0; t <= TICKS; t++) {
      page.drawText(fmt((barMax / TICKS) * t), {
        x: plotX + plotW + 4,
        y: yAt((yMax / TICKS) * t) - 2.5,
        size: AXIS_SIZE,
        font,
        color: AXIS_TEXT,
      });
    }
  }

  for (const s of chart.series) {
    const color = hex(s.color);
    const points = s.values
      .map((v, i) => (v === null ? null : { x: xAt(i), y: yAt(Math.min(v, yMax)) }))
      .filter((p): p is { x: number; y: number } => p !== null);
    if (!points.length) continue;

    if (s.area && points.length > 1) {
      const path =
        `M ${svgPoint(points[0].x, plotBottom)} ` +
        points.map((p) => `L ${svgPoint(p.x, p.y)}`).join(" ") +
        ` L ${svgPoint(points[points.length - 1].x, plotBottom)} Z`;
      page.drawSvgPath(path, { x: 0, y: 0, color, opacity: 0.15, borderWidth: 0 });
    }
    for (let i = 1; i < points.length; i++) {
      page.drawLine({
        start: points[i - 1],
        end: points[i],
        thickness: 1.5,
        color,
        dashArray: s.dashed ? [4, 3] : undefined,
      });
    }
    if (!s.dashed && points.length <= 31) {
      for (const p of points) page.drawCircle({ x: p.x, y: p.y, size: 1.6, color });
    }
  }

  // X labels: dd/mm, thinned out so they don't overlap.
  const labelW = font.widthOfTextAtSize("00/00", AXIS_SIZE) + 6;
  const every = Math.max(1, Math.ceil(labelW / slot));
  chart.labels.forEach((label, i) => {
    if (i % every !== 0) return;
    const text = `${label.slice(8, 10)}/${label.slice(5, 7)}`;
    page.drawText(text, {
      x: xAt(i) - font.widthOfTextAtSize(text, AXIS_SIZE) / 2,
      y: plotBottom - 10,
      size: AXIS_SIZE,
      font,
      color: AXIS_TEXT,
    });
  });
  page.drawLine({ start: { x: plotX, y: plotBottom }, end: { x: plotX + plotW, y: plotBottom }, thickness: 0.7, color: AXIS_TEXT });

  drawLegend(ctx, legendFor(chart), plotBottom - 20);
}

function drawStackedBars(ctx: ChartContext, chart: Extract<ReportChart, { type: "stackedBars" }>, top: number) {
  const { page, font } = ctx;
  const labelW = Math.min(150, ctx.width * 0.32);
  const totalW = 46;
  const barX = ctx.x + labelW + 6;
  const barW = ctx.width - labelW - 6 - totalW;

  chart.rows.forEach((row, i) => {
    const y = top - i * BAR_ROW_HEIGHT - 12;
    let label = ctx.sanitize(row.label);
    if (font.widthOfTextAtSize(label, LEGEND_SIZE) > labelW) {
      while (label.length > 1 && font.widthOfTextAtSize(label + "...", LEGEND_SIZE) > labelW) label = label.slice(0, -1);
      label += "...";
    }
    page.drawText(label, { x: ctx.x, y: y + 2, size: LEGEND_SIZE, font, color: TITLE_TEXT });

    const total = row.segments.reduce((a, s) => a + s.value, 0);
    page.drawRectangle({ x: barX, y, width: barW, height: 10, color: GRID });
    let offset = 0;
    for (const seg of row.segments) {
      if (!seg.value || !total) continue;
      const w = (seg.value / total) * barW;
      page.drawRectangle({ x: barX + offset, y, width: w, height: 10, color: hex(seg.color) });
      offset += w;
    }
    page.drawText(String(total), { x: barX + barW + 6, y: y + 2, size: LEGEND_SIZE, font, color: AXIS_TEXT });
  });

  drawLegend(ctx, chart.legend, top - chart.rows.length * BAR_ROW_HEIGHT - 4);
}

function drawDonut(ctx: ChartContext, chart: Extract<ReportChart, { type: "donut" }>, top: number) {
  const { page, font } = ctx;
  const r = DONUT_SIZE / 2;
  const inner = r * 0.6;
  const cx = ctx.x + r;
  const cy = top - r;
  const total = chart.slices.reduce((a, s) => a + s.value, 0);

  if (total === 0) {
    page.drawCircle({ x: cx, y: cy, size: r, color: GRID });
  } else {
    // Slices are polygons approximating the arc — avoids SVG arc flags,
    // which get confusing with pdf-lib's flipped y axis.
    let angle = 0;
    for (const slice of chart.slices) {
      if (!slice.value) continue;
      const sweep = (slice.value / total) * Math.PI * 2;
      const steps = Math.max(2, Math.ceil(sweep / 0.05));
      const outer: string[] = [];
      const innerPts: string[] = [];
      for (let k = 0; k <= steps; k++) {
        const a = angle + (sweep * k) / steps;
        outer.push(svgPoint(cx + r * Math.sin(a), cy + r * Math.cos(a)));
        innerPts.push(svgPoint(cx + inner * Math.sin(a), cy + inner * Math.cos(a)));
      }
      const path = `M ${outer.join(" L ")} L ${innerPts.reverse().join(" L ")} Z`;
      page.drawSvgPath(path, { x: 0, y: 0, color: hex(slice.color), borderColor: rgb(1, 1, 1), borderWidth: 0.8 });
      angle += sweep;
    }
  }
  const totalText = String(total);
  page.drawText(totalText, {
    x: cx - ctx.boldFont.widthOfTextAtSize(totalText, 14) / 2,
    y: cy - 2,
    size: 14,
    font: ctx.boldFont,
    color: TITLE_TEXT,
  });
  page.drawText("casos", { x: cx - font.widthOfTextAtSize("casos", AXIS_SIZE) / 2, y: cy - 11, size: AXIS_SIZE, font, color: AXIS_TEXT });

  // Legend to the right of the donut, one entry per line.
  const legendX = ctx.x + DONUT_SIZE + 24;
  chart.slices
    .filter((s) => s.value > 0)
    .forEach((slice, i) => {
      const y = top - 18 - i * LEGEND_HEIGHT;
      page.drawRectangle({ x: legendX, y: y - 1, width: 9, height: 9, color: hex(slice.color) });
      const text = `${slice.label}: ${slice.value} (${Math.round((slice.value / total) * 100)}%)`;
      page.drawText(ctx.sanitize(text), { x: legendX + 14, y, size: LEGEND_SIZE, font, color: TITLE_TEXT });
    });
}

function drawSquares(ctx: ChartContext, chart: Extract<ReportChart, { type: "squares" }>, top: number) {
  const perRow = Math.max(1, Math.floor((ctx.width + SQUARE_GAP) / (SQUARE + SQUARE_GAP)));
  chart.colors.forEach((color, i) => {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    ctx.page.drawRectangle({
      x: ctx.x + col * (SQUARE + SQUARE_GAP),
      y: top - row * (SQUARE + SQUARE_GAP) - SQUARE,
      width: SQUARE,
      height: SQUARE,
      color: hex(color),
    });
  });
  const rows = Math.ceil(chart.colors.length / perRow);
  drawLegend(ctx, chart.legend, top - rows * (SQUARE + SQUARE_GAP) - 6);
}
