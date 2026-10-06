"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";

export type Status = "untested" | "passed" | "failed" | "blocked" | "skipped";
export type StatusCounts = Record<Status, number>;

export type DashboardData = {
  totalCases: number;
  completion: {
    totalCases: number;
    // Latest result per case; `untested` = never executed.
    counts: StatusCounts;
    percent: number;
    change: number;
    trend: { day: string; percent: number }[];
    trendStart: string;
  };
  totalRuns: number;
  active: {
    count: number;
    notStarted: number;
    pending: number;
    contributors: number;
    daysLeft: number | null;
  };
  openDefects: number;
  burndown: {
    points: {
      day: string;
      executed: number | null;
      remaining: number | null;
      forecast: number | null;
    }[];
    total: number;
    pending: number;
    velocity: number;
    forecastDay: string | null;
    daysLeft: number | null;
  } | null;
  latestResults: { statuses: Status[]; from: string | null; to: string | null };
  activeRuns: {
    id: string;
    name: string;
    total: number;
    counts: StatusCounts;
    contributors: string[];
  }[];
  activity: {
    day: string;
    passed: number;
    failed: number;
    blocked: number;
    skipped: number;
    defects: number;
  }[];
  activityStart: string;
  testers: {
    name: string;
    automated: boolean;
    counts: StatusCounts;
    total: number;
    recent: number;
    lastAt: string;
  }[];
  recentCounts: StatusCounts;
};

const STATUS_COLORS: Record<Status, string> = {
  passed: "#22a55b",
  failed: "#e5484d",
  blocked: "#f59e0b",
  skipped: "#14a3b8",
  untested: "#cbd5e1",
};

const STATUS_LABELS: Record<Status, string> = {
  passed: "Passed",
  failed: "Failed",
  blocked: "Blocked",
  skipped: "Skipped",
  untested: "Sin probar",
};

const STATUS_ORDER: Status[] = ["passed", "failed", "blocked", "skipped", "untested"];

const BLUE = "#2a8bd6";
const ORANGE = "#f39a4c";
const PURPLE = "#c86fa8";
const INK_SECONDARY = "#64748b";
const GRIDLINE = "#e2e8f0";
const AVATAR_COLORS = ["#0d9488", "#2563eb", "#9333ea", "#db2777", "#ea580c", "#65a30d"];

const shortDay = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;
const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

export default function DashboardCharts({
  projectId,
  data,
}: {
  projectId: string;
  data: DashboardData;
}) {
  return (
    <div className="space-y-4">
      <ReportDownload projectId={projectId} />
      <CompletionCard completion={data.completion} />
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-4 min-w-0">
          <BurndownCard burndown={data.burndown} />
          <ActivityCard activity={data.activity} />
          <TestersCard testers={data.testers} />
        </div>
        <div className="space-y-4 min-w-0">
          <div className="grid gap-4 sm:grid-cols-2">
            <ActiveCard active={data.active} openDefects={data.openDefects} totalCases={data.totalCases} />
            <LatestResultsCard latest={data.latestResults} />
          </div>
          <ActiveRunsCard projectId={projectId} runs={data.activeRuns} />
          <RunStatusCard counts={data.recentCounts} />
        </div>
      </div>
    </div>
  );
}

function Card({
  title,
  right,
  children,
  className = "",
}: {
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white border border-slate-200 rounded-xl p-5 ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between gap-3 mb-4">
          {title && (
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {title}
            </h3>
          )}
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

function LegendItem({
  color,
  label,
  sub,
  dashed,
}: {
  color: string;
  label: React.ReactNode;
  sub?: React.ReactNode;
  dashed?: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        className="w-4 h-4 rounded-sm shrink-0 mt-0.5"
        style={
          dashed
            ? { border: `2px dashed ${color}` }
            : { backgroundColor: color }
        }
      />
      <div className="min-w-0">
        <p className="text-sm text-slate-700 leading-tight">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="h-40 flex items-center justify-center text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg text-center px-4">
      {text}
    </div>
  );
}

// ---------- Project completion ----------
const COMPLETION_LABELS: Record<Status, string> = {
  passed: "Aprobados",
  failed: "Fallidos",
  blocked: "Bloqueados",
  skipped: "Omitidos",
  untested: "Sin ejecutar",
};

type ReportFormat = "docx" | "pdf";

function ReportDownload({ projectId }: { projectId: string }) {
  const [downloading, setDownloading] = useState<ReportFormat | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function download(format: ReportFormat) {
    setDownloading(format);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/reports/dashboard?format=${format}`);
      if (!res.ok) {
        setErrorMsg("No se pudo generar el informe.");
        return;
      }
      const blob = await res.blob();
      const match = (res.headers.get("Content-Disposition") || "").match(/filename="(.+?)"/);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = match?.[1] || `informe-dashboard.${format}`;
      link.click();
      URL.revokeObjectURL(objectUrl);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="flex items-center justify-end gap-2 flex-wrap">
      {errorMsg && <p className="text-sm text-red-600 mr-auto">{errorMsg}</p>}
      <span className="text-sm text-slate-500">Descargar informe:</span>
      <button
        onClick={() => download("docx")}
        disabled={downloading !== null}
        className="rounded-lg bg-teal-600 text-white text-sm font-medium px-3 py-1.5 hover:bg-teal-700 disabled:opacity-50"
      >
        {downloading === "docx" ? "Generando..." : "⬇ Word"}
      </button>
      <button
        onClick={() => download("pdf")}
        disabled={downloading !== null}
        className="rounded-lg bg-slate-700 text-white text-sm font-medium px-3 py-1.5 hover:bg-slate-800 disabled:opacity-50"
      >
        {downloading === "pdf" ? "Generando..." : "⬇ PDF"}
      </button>
    </div>
  );
}

function CompletionCard({ completion }: { completion: DashboardData["completion"] }) {
  const { totalCases, counts, percent, change, trend } = completion;
  if (totalCases === 0) {
    return (
      <Card title="Avance del proyecto">
        <EmptyState text="El proyecto aún no tiene casos de prueba." />
      </Card>
    );
  }
  return (
    <Card title="Avance del proyecto">
      <div className="flex flex-col lg:flex-row gap-6 lg:items-center">
        <div className="lg:w-1/2 min-w-0">
          <div className="flex items-end gap-3 flex-wrap">
            <span className="text-4xl font-semibold text-slate-900 leading-none">{percent}%</span>
            <span className="text-sm text-slate-500 pb-1">
              completado · {counts.passed} de {totalCases} casos aprobados
            </span>
          </div>
          <p
            className={`text-xs mt-2 ${
              change > 0 ? "text-emerald-600" : change < 0 ? "text-red-600" : "text-slate-400"
            }`}
          >
            {change > 0 ? "▲" : change < 0 ? "▼" : "■"} {change > 0 ? "+" : ""}
            {change} puntos en los últimos 30 días
          </p>
          <div className="flex h-3 rounded-full overflow-hidden bg-slate-100 mt-4">
            {STATUS_ORDER.filter((s) => counts[s]).map((s) => (
              <span
                key={s}
                title={`${COMPLETION_LABELS[s]}: ${counts[s]}`}
                style={{
                  width: `${(counts[s] / totalCases) * 100}%`,
                  backgroundColor: STATUS_COLORS[s],
                }}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 text-xs text-slate-600">
            {STATUS_ORDER.map((s) => (
              <span key={s} className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-sm"
                  style={{ backgroundColor: STATUS_COLORS[s] }}
                />
                <span className="font-medium text-slate-800">{counts[s]}</span>
                {COMPLETION_LABELS[s]}
                <span className="text-slate-400">({pct(counts[s], totalCases)}%)</span>
              </span>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 mt-3">
            Cada caso cuenta con su resultado más reciente en cualquier run.
          </p>
        </div>
        <div className="lg:w-1/2 min-w-0">
          <p className="text-xs text-slate-500 mb-1">% aprobado del proyecto · últimos 30 días</p>
          <ResponsiveContainer width="100%" height={150}>
            <AreaChart data={trend} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="completionFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={STATUS_COLORS.passed} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={STATUS_COLORS.passed} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={GRIDLINE} />
              <XAxis
                dataKey="day"
                tickFormatter={shortDay}
                tick={{ fontSize: 11, fill: INK_SECONDARY }}
                axisLine={{ stroke: GRIDLINE }}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                unit="%"
                tick={{ fontSize: 11, fill: INK_SECONDARY }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: GRIDLINE }}
                labelFormatter={(k: any) => shortDay(String(k))}
                formatter={(value: any) => [`${value}%`, "Completado"]}
              />
              <Area
                type="monotone"
                dataKey="percent"
                stroke={STATUS_COLORS.passed}
                strokeWidth={2}
                fill="url(#completionFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Card>
  );
}

// ---------- Run progress (burndown of active runs) ----------
function BurndownCard({ burndown }: { burndown: DashboardData["burndown"] }) {
  if (!burndown) {
    return (
      <Card title="Progreso de runs activos">
        <EmptyState text="No hay test runs activos para mostrar su progreso." />
      </Card>
    );
  }
  const todayKey = [...burndown.points].reverse().find((p) => p.remaining !== null)?.day;
  const maxExecuted = Math.max(1, ...burndown.points.map((p) => p.executed ?? 0));

  return (
    <Card title="Progreso de runs activos">
      <div className="flex flex-col lg:flex-row gap-5">
        <div className="flex-1 min-w-0">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={burndown.points} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={GRIDLINE} />
              <XAxis
                dataKey="day"
                tickFormatter={shortDay}
                tick={{ fontSize: 11, fill: INK_SECONDARY }}
                axisLine={{ stroke: GRIDLINE }}
                tickLine={false}
                minTickGap={20}
              />
              <YAxis
                yAxisId="cases"
                tick={{ fontSize: 11, fill: INK_SECONDARY }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              {/* Bars use their own scale so they stay in the lower third of the chart. */}
              <YAxis yAxisId="bars" hide domain={[0, maxExecuted * 3]} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: GRIDLINE }}
                labelFormatter={(k: any) => shortDay(String(k))}
                formatter={(value: any, key: any) => {
                  const labels: Record<string, string> = {
                    executed: "Ejecutados ese día",
                    remaining: "Pendientes",
                    forecast: "Pronóstico",
                  };
                  return [Math.round(Number(value)), labels[key as string] || key];
                }}
              />
              {todayKey && (
                <ReferenceLine
                  yAxisId="cases"
                  x={todayKey}
                  stroke="#94a3b8"
                  strokeDasharray="3 3"
                  label={{ value: "Hoy", position: "insideTopRight", fontSize: 11, fill: INK_SECONDARY }}
                />
              )}
              <Bar yAxisId="bars" dataKey="executed" fill={STATUS_COLORS.passed} barSize={6} />
              <Line
                yAxisId="cases"
                type="linear"
                dataKey="forecast"
                stroke={BLUE}
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                connectNulls
              />
              <Line
                yAxisId="cases"
                type="monotone"
                dataKey="remaining"
                stroke={ORANGE}
                strokeWidth={2}
                dot={{ r: 2, fill: ORANGE }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="lg:w-48 shrink-0 space-y-4">
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500">Pronóstico</span>
              <span className="rounded-md bg-orange-50 text-orange-700 text-xs font-medium px-2 py-0.5">
                {burndown.pending === 0
                  ? "Completado"
                  : burndown.forecastDay
                  ? shortDay(burndown.forecastDay)
                  : "Sin datos"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500">Velocidad</span>
              <span className="text-slate-700 text-xs font-medium">
                {burndown.velocity} casos/día
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500">Pendientes</span>
              <span className="text-slate-700 text-xs font-medium">
                {burndown.pending} de {burndown.total}
              </span>
            </div>
          </div>
          <div className="space-y-2.5 pt-3 border-t border-slate-100">
            <LegendItem color={BLUE} dashed label="Pronóstico" />
            <LegendItem color={STATUS_COLORS.passed} label="Ejecutados por día" />
            <LegendItem color={ORANGE} label="Casos pendientes" />
          </div>
        </div>
      </div>
    </Card>
  );
}

// ---------- Activity, last 14 days ----------
const ACTIVITY_SERIES = [
  { key: "passed", label: "Passed", color: STATUS_COLORS.passed, verb: "marcados Passed" },
  { key: "failed", label: "Failed", color: STATUS_COLORS.failed, verb: "marcados Failed" },
  { key: "blocked", label: "Blocked", color: STATUS_COLORS.blocked, verb: "marcados Blocked" },
  { key: "skipped", label: "Skipped", color: STATUS_COLORS.skipped, verb: "marcados Skipped" },
  { key: "defects", label: "Defectos", color: PURPLE, verb: "defectos reportados" },
] as const;

function ActivityCard({ activity }: { activity: DashboardData["activity"] }) {
  const totals = Object.fromEntries(
    ACTIVITY_SERIES.map((s) => [s.key, activity.reduce((a, d) => a + d[s.key], 0)])
  ) as Record<(typeof ACTIVITY_SERIES)[number]["key"], number>;
  const totalChanges = Object.values(totals).reduce((a, b) => a + b, 0);

  return (
    <Card title="Actividad de ejecución">
      <div className="flex flex-col lg:flex-row gap-5">
        <div className="flex-1 min-w-0">
          {totalChanges === 0 ? (
            <EmptyState text="Sin actividad en los últimos 14 días." />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={activity} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={GRIDLINE} />
                <XAxis
                  dataKey="day"
                  tickFormatter={shortDay}
                  tick={{ fontSize: 11, fill: INK_SECONDARY }}
                  axisLine={{ stroke: GRIDLINE }}
                  tickLine={false}
                  minTickGap={16}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: INK_SECONDARY }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: GRIDLINE }}
                  labelFormatter={(k: any) => shortDay(String(k))}
                  formatter={(value: any, key: any) => [
                    value,
                    ACTIVITY_SERIES.find((s) => s.key === key)?.label || key,
                  ]}
                />
                {ACTIVITY_SERIES.map((s) => (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    stroke={s.color}
                    strokeWidth={2}
                    dot={{ r: 2.5, fill: s.color }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="lg:w-48 shrink-0">
          <p className="text-lg font-semibold text-slate-900 leading-tight">Últimos 14 días</p>
          <p className="text-xs text-slate-400 mb-4">{totalChanges} cambios recientes</p>
          <div className="space-y-3">
            {ACTIVITY_SERIES.map((s) => (
              <LegendItem
                key={s.key}
                color={s.color}
                label={s.label}
                sub={`${totals[s.key]} ${s.verb}`}
              />
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ---------- Active runs ring ----------
function ActiveCard({
  active,
  openDefects,
  totalCases,
}: {
  active: DashboardData["active"];
  openDefects: number;
  totalCases: number;
}) {
  const started = active.count - active.notStarted;
  const fraction = active.count > 0 ? started / active.count : 0;
  const r = 42;
  const circumference = 2 * Math.PI * r;

  return (
    <Card>
      <div className="flex items-center gap-4">
        <div className="relative w-28 h-28 shrink-0">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle cx="50" cy="50" r={r} fill="none" stroke="#dbeafe" strokeWidth="9" />
            <circle
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={BLUE}
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={`${circumference * fraction} ${circumference}`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Activos
            </span>
            <span className="text-2xl font-semibold text-slate-900 leading-none my-0.5">
              {active.count}
            </span>
            <span className="text-[10px] text-teal-600">{active.notStarted} sin iniciar</span>
          </div>
        </div>
        <div className="min-w-0 space-y-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Runs activos
          </h3>
          <p className="text-xs text-slate-600">
            ⏱{" "}
            <span className="font-medium text-slate-800">
              {active.pending === 0
                ? "Sin pendientes"
                : active.daysLeft !== null
                ? `~${active.daysLeft} días`
                : `${active.pending} casos`}
            </span>{" "}
            {active.pending > 0 && active.daysLeft !== null && "de trabajo estimado"}
            {active.pending > 0 && active.daysLeft === null && "pendientes"}
          </p>
          <p className="text-xs text-slate-600">
            👥 <span className="font-medium text-slate-800">{active.contributors}</span>{" "}
            colaboradores
          </p>
          <p className="text-xs text-slate-600">
            🐞 <span className="font-medium text-slate-800">{openDefects}</span> defectos abiertos
          </p>
          <p className="text-xs text-slate-600">
            🧪 <span className="font-medium text-slate-800">{totalCases}</span> casos de prueba
          </p>
        </div>
      </div>
    </Card>
  );
}

// ---------- Latest results grid ----------
function LatestResultsCard({ latest }: { latest: DashboardData["latestResults"] }) {
  const days =
    latest.from && latest.to
      ? Math.round(
          (new Date(latest.to).getTime() - new Date(latest.from).getTime()) / 86400000
        ) + 1
      : 0;
  return (
    <Card>
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 text-center mb-3">
        Últimos resultados
      </h3>
      {latest.statuses.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-8">Aún no hay ejecuciones.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-[3px] justify-center">
            {latest.statuses.map((s, i) => (
              <span
                key={i}
                title={STATUS_LABELS[s]}
                className="w-2.5 h-2.5 rounded-[2px]"
                style={{ backgroundColor: STATUS_COLORS[s] }}
              />
            ))}
          </div>
          <p className="text-xs text-slate-500 text-center mt-3">
            {shortDay(latest.from!)} – {shortDay(latest.to!)} ({days}{" "}
            {days === 1 ? "día" : "días"})
          </p>
        </>
      )}
    </Card>
  );
}

// ---------- Active runs table ----------
const ACTIVITY_SQUARES = 20;

// Splits a run's results into a fixed number of squares, proportional to each status.
function activitySquares(counts: StatusCounts, total: number): Status[] {
  if (total === 0) return Array(ACTIVITY_SQUARES).fill("untested");
  const squares: Status[] = [];
  let acc = 0;
  for (const s of STATUS_ORDER) {
    acc += counts[s];
    const upTo = Math.round((acc / total) * ACTIVITY_SQUARES);
    while (squares.length < upTo) squares.push(s);
  }
  return squares;
}

function Avatar({ name, index }: { name: string; index: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      title={name}
      className="w-6 h-6 rounded-full border-2 border-white text-[9px] font-semibold text-white flex items-center justify-center"
      style={{
        backgroundColor: AVATAR_COLORS[hash % AVATAR_COLORS.length],
        marginLeft: index === 0 ? 0 : -6,
      }}
    >
      {initials || "?"}
    </span>
  );
}

function ActiveRunsCard({
  projectId,
  runs,
}: {
  projectId: string;
  runs: DashboardData["activeRuns"];
}) {
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-3 bg-slate-50 border-b border-slate-200">
        <span className="text-sm font-medium text-teal-700">🏁 Runs en curso</span>
        <Link
          href={`/projects/${projectId}/runs`}
          className="text-xs text-slate-500 hover:text-teal-700"
        >
          Ver todos →
        </Link>
      </div>
      {runs.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">No hay runs activos.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="font-medium px-5 py-2">Run</th>
                <th className="font-medium px-3 py-2">Estado</th>
                <th className="font-medium px-3 py-2">Colaboradores</th>
                <th className="font-medium px-5 py-2">Actividad</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const executed = run.total - run.counts.untested;
                const notStarted = executed === 0;
                return (
                  <tr key={run.id} className="border-t border-slate-100">
                    <td className="px-5 py-2.5 max-w-[200px]">
                      <Link
                        href={`/projects/${projectId}/runs/${run.id}`}
                        className="block truncate text-slate-800 hover:text-teal-700"
                        title={run.name}
                      >
                        {run.name}
                      </Link>
                      <span className="text-xs text-slate-400">
                        {executed}/{run.total} ejecutados
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span
                        className={`text-xs ${notStarted ? "text-slate-500" : "text-blue-600"}`}
                      >
                        {notStarted ? "○ Sin iniciar" : "↻ En progreso"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center">
                        {run.contributors.slice(0, 4).map((name, i) => (
                          <Avatar key={name + i} name={name} index={i} />
                        ))}
                        {run.contributors.length > 4 && (
                          <span className="text-xs text-slate-400 ml-1">
                            +{run.contributors.length - 4}
                          </span>
                        )}
                        {run.contributors.length === 0 && (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-2.5">
                      <div className="flex gap-[2px]" title={STATUS_ORDER.filter((s) => run.counts[s]).map((s) => `${STATUS_LABELS[s]}: ${run.counts[s]}`).join(" · ")}>
                        {activitySquares(run.counts, run.total).map((s, i) => (
                          <span
                            key={i}
                            className="w-2 h-3 rounded-[1px]"
                            style={
                              s === "untested"
                                ? { border: `1px solid ${STATUS_COLORS.untested}` }
                                : { backgroundColor: STATUS_COLORS[s] }
                            }
                          />
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ---------- Who ran the tests ----------
function TestersCard({ testers }: { testers: DashboardData["testers"] }) {
  return (
    <Card title="Quién ejecutó los tests">
      {testers.length === 0 ? (
        <EmptyState text="Aún no hay ejecuciones registradas." />
      ) : (
        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="font-medium px-5 py-2">Tester</th>
                <th className="font-medium px-3 py-2 text-right">Ejecutados</th>
                <th className="font-medium px-3 py-2 text-right">Últimos 14 días</th>
                <th className="font-medium px-3 py-2 w-[35%]">Resultados</th>
                <th className="font-medium px-5 py-2 text-right">Última vez</th>
              </tr>
            </thead>
            <tbody>
              {testers.map((t, i) => (
                <tr key={t.name + i} className="border-t border-slate-100">
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      {t.automated ? (
                        <span className="w-6 h-6 rounded-full bg-slate-100 text-xs flex items-center justify-center shrink-0">
                          🤖
                        </span>
                      ) : (
                        <Avatar name={t.name} index={0} />
                      )}
                      <span className="truncate text-slate-800">{t.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium text-slate-800">{t.total}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{t.recent}</td>
                  <td className="px-3 py-2.5">
                    <div
                      className="flex h-2.5 rounded-full overflow-hidden bg-slate-100"
                      title={STATUS_ORDER.filter((s) => t.counts[s])
                        .map((s) => `${STATUS_LABELS[s]}: ${t.counts[s]}`)
                        .join(" · ")}
                    >
                      {STATUS_ORDER.filter((s) => t.counts[s]).map((s) => (
                        <span
                          key={s}
                          style={{
                            width: `${(t.counts[s] / t.total) * 100}%`,
                            backgroundColor: STATUS_COLORS[s],
                          }}
                        />
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-2.5 text-right text-xs text-slate-500 whitespace-nowrap">
                    {shortDay(t.lastAt.slice(0, 10))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ---------- Run status pie (last 10 runs) ----------
function RunStatusCard({ counts }: { counts: StatusCounts }) {
  const total = STATUS_ORDER.reduce((a, s) => a + counts[s], 0);
  const executed = total - counts.untested;
  const others = counts.blocked + counts.skipped + counts.untested;
  const pieData = STATUS_ORDER.filter((s) => counts[s] > 0).map((s) => ({
    key: s,
    name: STATUS_LABELS[s],
    value: counts[s],
  }));

  return (
    <Card title="Estado de ejecución · últimos 10 runs">
      {total === 0 ? (
        <EmptyState text="Aún no hay test runs para graficar." />
      ) : (
        <>
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="w-full sm:w-1/2 min-w-0">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    outerRadius="95%"
                    startAngle={90}
                    endAngle={-270}
                    stroke="#fff"
                    strokeWidth={2}
                    isAnimationActive={false}
                  >
                    {pieData.map((d) => (
                      <Cell key={d.key} fill={STATUS_COLORS[d.key]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: GRIDLINE }}
                    formatter={(value: any, name: any) => [`${value} (${pct(Number(value), total)}%)`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full sm:w-1/2">
              <p className="text-lg font-semibold text-slate-900 leading-tight">
                {pct(executed, total)}% completado
              </p>
              <p className="text-xs text-slate-400 mb-4">
                {counts.untested} de {total} pendientes
              </p>
              <div className="space-y-3">
                {STATUS_ORDER.map((s) => (
                  <LegendItem
                    key={s}
                    color={STATUS_COLORS[s]}
                    label={
                      <>
                        <span className="font-medium">{counts[s]}</span> {STATUS_LABELS[s]}
                      </>
                    }
                    sub={`${pct(counts[s], total)}%`}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-5 pt-4 border-t border-slate-100 text-xs">
            <SummaryPill pct={pct(counts.passed, total)} label={`${counts.passed} exitosos`} color={STATUS_COLORS.passed} />
            <SummaryPill pct={pct(counts.failed, total)} label={`${counts.failed} fallidos`} color={STATUS_COLORS.failed} />
            <SummaryPill pct={pct(others, total)} label={`${others} otros`} color="#94a3b8" />
          </div>
        </>
      )}
    </Card>
  );
}

function SummaryPill({ pct, label, color }: { pct: number; label: string; color: string }) {
  return (
    <div className="flex rounded-md overflow-hidden border" style={{ borderColor: color }}>
      <span className="px-2 py-1 font-semibold text-white" style={{ backgroundColor: color }}>
        {pct}%
      </span>
      <span className="px-2 py-1 text-slate-600 truncate">{label}</span>
    </div>
  );
}
