"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

const STATUS_COLORS = {
  passed: "#0ca30c",
  failed: "#d03b3b",
  blocked: "#ec835a",
  skipped: "#898781",
  untested: "#c3c2b7",
};

const STATUS_LABELS: Record<string, string> = {
  passed: "Passed",
  failed: "Failed",
  blocked: "Blocked",
  skipped: "Skipped",
  untested: "Sin probar",
};

const INK_SECONDARY = "#52514e";
const GRIDLINE = "#e1e0d9";
const SERIES_BLUE = "#2a78d6";

function StatTile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-2xl font-semibold text-slate-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function DashboardCharts({
  totalCases,
  totalRuns,
  overallStats,
  runTrend,
  defectStats,
}: {
  totalCases: number;
  totalRuns: number;
  overallStats: Record<string, number>;
  runTrend: any[];
  defectStats: Record<string, number>;
}) {
  const totalExecutions = Object.values(overallStats).reduce((a, b) => a + b, 0);
  const passRate = totalExecutions > 0 ? Math.round((overallStats.passed / totalExecutions) * 100) : 0;
  const openDefects = defectStats.open + defectStats.in_progress;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatTile label="Casos de prueba" value={totalCases} />
        <StatTile label="Test runs" value={totalRuns} />
        <StatTile label="% Pass rate (últimos 10 runs)" value={`${passRate}%`} />
        <StatTile label="Defectos abiertos" value={openDefects} sub={`${defectStats.closed} cerrados`} />
        <StatTile label="❌ Failed (últimos 10 runs)" value={overallStats.failed} />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-slate-700">Resultados por run</h3>
          <Legend2 />
        </div>
        {runTrend.length === 0 ? (
          <EmptyState text="Aún no hay test runs para graficar." />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={runTrend} barCategoryGap={16}>
              <CartesianGrid vertical={false} stroke={GRIDLINE} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12, fill: INK_SECONDARY }}
                axisLine={{ stroke: GRIDLINE }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: INK_SECONDARY }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: GRIDLINE }}
                formatter={(value: any, key: any) => [value, STATUS_LABELS[key as string] || key]}
              />
              {(["passed", "failed", "blocked", "skipped", "untested"] as const).map((k) => (
                <Bar key={k} dataKey={k} stackId="a" fill={STATUS_COLORS[k]} radius={0} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="text-sm font-medium text-slate-700 mb-4">Tendencia de % aprobado</h3>
        {runTrend.length === 0 ? (
          <EmptyState text="Aún no hay datos de tendencia." />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={runTrend}>
              <CartesianGrid vertical={false} stroke={GRIDLINE} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12, fill: INK_SECONDARY }}
                axisLine={{ stroke: GRIDLINE }}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 12, fill: INK_SECONDARY }}
                axisLine={false}
                tickLine={false}
                unit="%"
              />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: GRIDLINE }}
                formatter={(value: any) => [`${value}%`, "Pass rate"]}
              />
              <Line
                type="monotone"
                dataKey="passRate"
                stroke={SERIES_BLUE}
                strokeWidth={2}
                dot={{ r: 4, fill: SERIES_BLUE }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function Legend2() {
  return (
    <div className="flex gap-3 text-xs text-slate-500">
      {Object.entries(STATUS_LABELS).map(([k, label]) => (
        <span key={k} className="flex items-center gap-1">
          <span
            className="w-2.5 h-2.5 rounded-sm inline-block"
            style={{ backgroundColor: STATUS_COLORS[k as keyof typeof STATUS_COLORS] }}
          />
          {label}
        </span>
      ))}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="h-40 flex items-center justify-center text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg">
      {text}
    </div>
  );
}
