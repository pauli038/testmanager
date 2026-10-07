"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bug,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  Download,
  Loader,
  Network,
  Search,
  Tag,
} from "lucide-react";
import {
  AutomatedBadge,
  Badge,
  Button,
  Card,
  CodeBadge,
  EmptyState,
  Input,
  Segmented,
  StatusBadge,
  cn,
} from "@/components/ui";
import { STATUS_COLORS } from "@/lib/dashboard-colors";
import type {
  CaseStatus,
  Requirement,
  RequirementHealth,
  TraceabilityData,
  TraceCase,
} from "@/lib/traceability";

const HEALTH_META: Record<
  RequirementHealth,
  { label: string; tone: "danger" | "success" | "info" | "neutral"; icon: typeof CircleCheck }
> = {
  at_risk: { label: "En riesgo", tone: "danger", icon: AlertTriangle },
  in_progress: { label: "En progreso", tone: "info", icon: Loader },
  not_run: { label: "Sin ejecutar", tone: "neutral", icon: CircleDashed },
  covered: { label: "Cubierto", tone: "success", icon: CircleCheck },
};

const BAR_ORDER: CaseStatus[] = ["passed", "failed", "blocked", "skipped", "untested"];
const STATUS_LABEL: Record<CaseStatus, string> = {
  passed: "Aprobado",
  failed: "Fallido",
  blocked: "Bloqueado",
  skipped: "Omitido",
  untested: "Sin ejecutar",
};

type Filter = "all" | RequirementHealth;

function matches(text: string, q: string) {
  return text.toLowerCase().includes(q);
}

function ResultsBar({ counts, total }: { counts: Record<CaseStatus, number>; total: number }) {
  return (
    <div
      className="flex h-2 w-full rounded-full overflow-hidden bg-slate-100"
      title={BAR_ORDER.filter((s) => counts[s])
        .map((s) => `${STATUS_LABEL[s]}: ${counts[s]}`)
        .join(" · ")}
    >
      {BAR_ORDER.map((s) =>
        counts[s] ? (
          <span
            key={s}
            style={{ width: `${(counts[s] / total) * 100}%`, backgroundColor: STATUS_COLORS[s] }}
          />
        ) : null
      )}
    </div>
  );
}

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("es-CR") : "—";
}

function csvCell(v: string | number) {
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(projectName: string, data: TraceabilityData) {
  const header = [
    "Requisito",
    "Estado del requisito",
    "Código",
    "Caso",
    "Suite",
    "Último resultado",
    "Fecha",
    "Automatizado",
    "Defectos abiertos",
  ];
  const caseRow = (req: string, health: string, c: TraceCase) => [
    req,
    health,
    c.code ?? "",
    c.title,
    c.suiteName,
    STATUS_LABEL[c.status],
    formatDate(c.lastExecutedAt),
    c.automated ? "Sí" : "No",
    c.openDefects,
  ];
  const rows = [
    header,
    ...data.requirements.flatMap((r) =>
      r.cases.map((c) => caseRow(r.key, HEALTH_META[r.health].label, c))
    ),
    ...data.unassigned.map((c) => caseRow("(sin requisito)", "", c)),
  ];
  // BOM so Excel opens the accents correctly.
  const csv = "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `trazabilidad-${projectName.trim().toLowerCase().replace(/\s+/g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function CaseRows({ cases, projectId }: { cases: TraceCase[]; projectId: string }) {
  return (
    <ul className="divide-y divide-slate-100">
      {cases.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
          <StatusBadge status={c.status} className="shrink-0" />
          <CodeBadge code={c.code} className="shrink-0" />
          <Link
            href={`/projects/${projectId}/suites`}
            className="min-w-0 flex-1 truncate text-slate-800 hover:text-brand-700"
            title={c.title}
          >
            {c.title}
          </Link>
          <span className="flex items-center gap-1.5 shrink-0 text-xs text-slate-500">
            {c.automated && <AutomatedBadge label="Auto" />}
            {c.openDefects > 0 && (
              <Badge tone="danger" icon={Bug}>
                {c.openDefects}
              </Badge>
            )}
            <span className="hidden sm:inline w-24 truncate" title={c.suiteName}>
              {c.suiteName}
            </span>
            <span className="tabular-nums w-20 text-right">{formatDate(c.lastExecutedAt)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function TraceabilityMatrix({
  projectId,
  projectName,
  data,
}: {
  projectId: string;
  projectName: string;
  data: TraceabilityData;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showUnassigned, setShowUnassigned] = useState(false);

  const healthCounts = useMemo(() => {
    const counts: Record<RequirementHealth, number> = {
      at_risk: 0,
      in_progress: 0,
      not_run: 0,
      covered: 0,
    };
    for (const r of data.requirements) counts[r.health]++;
    return counts;
  }, [data]);

  const totals = useMemo(() => {
    const cases = data.requirements.flatMap((r) => r.cases);
    return {
      cases: cases.length,
      automated: cases.filter((c) => c.automated).length,
    };
  }, [data]);

  const q = query.trim().toLowerCase();
  // A search hit on a case keeps its requirement and shows only matching cases.
  const visible = useMemo(() => {
    const out: { req: Requirement; cases: TraceCase[] }[] = [];
    for (const r of data.requirements) {
      if (filter !== "all" && r.health !== filter) continue;
      if (!q || matches(r.key, q)) {
        out.push({ req: r, cases: r.cases });
        continue;
      }
      const hits = r.cases.filter((c) => matches(c.title, q) || (c.code && matches(c.code, q)));
      if (hits.length) out.push({ req: r, cases: hits });
    }
    return out;
  }, [data, filter, q]);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (data.requirements.length === 0 && data.unassigned.length === 0) {
    return (
      <EmptyState
        icon={Network}
        title="Todavía no hay casos de prueba"
        description="La matriz agrupa los casos por requisito a partir de su código (ej. TC-RF020-06 → RF-020)."
      />
    );
  }

  const automatedPct = totals.cases ? Math.round((totals.automated / totals.cases) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">Matriz de trazabilidad</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Cada requisito con sus casos y el resultado más reciente de cada uno. El requisito sale
            del código del caso: <span className="font-mono text-xs">TC-RF020-06</span> → RF-020.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon={Download}
          onClick={() => downloadCsv(projectName, data)}
        >
          Exportar CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Card className="!p-4">
          <p className="text-xs text-slate-500">Requisitos</p>
          <p className="text-2xl font-semibold tabular-nums text-slate-900 mt-1">
            {data.requirements.length}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">{totals.cases} casos vinculados</p>
        </Card>
        {(["at_risk", "in_progress", "not_run", "covered"] as const).map((h) => {
          const meta = HEALTH_META[h];
          const active = filter === h;
          return (
            <button
              key={h}
              type="button"
              onClick={() => setFilter(active ? "all" : h)}
              aria-pressed={active}
              className={cn(
                "text-left rounded-xl border bg-white p-4 shadow-sm transition-colors",
                active ? "border-brand-400 ring-2 ring-brand-500/20" : "border-slate-200 hover:border-slate-300"
              )}
            >
              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                <meta.icon
                  size={13}
                  aria-hidden
                  className={cn(
                    h === "at_risk" && "text-red-500",
                    h === "covered" && "text-emerald-500",
                    h === "in_progress" && "text-cyan-600"
                  )}
                />
                {meta.label}
              </p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900 mt-1">{healthCounts[h]}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {data.requirements.length
                  ? Math.round((healthCounts[h] / data.requirements.length) * 100)
                  : 0}
                % de los requisitos
              </p>
            </button>
          );
        })}
        <Card className="!p-4">
          <p className="text-xs text-slate-500">Automatizados</p>
          <p className="text-2xl font-semibold tabular-nums text-slate-900 mt-1">{automatedPct}%</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {totals.automated} de {totals.cases} casos
          </p>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search
            size={15}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar requisito, código o caso…"
            className="pl-8"
            aria-label="Buscar en la matriz"
          />
        </div>
        <Segmented
          value={filter}
          onChange={setFilter}
          className="max-w-full overflow-x-auto"
          options={[
            { value: "all", label: "Todos" },
            { value: "at_risk", label: "En riesgo" },
            { value: "in_progress", label: "En progreso" },
            { value: "not_run", label: "Sin ejecutar" },
            { value: "covered", label: "Cubiertos" },
          ]}
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={Search} title="Ningún requisito coincide con el filtro" />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5 font-medium">Requisito</th>
                <th className="px-3 py-2.5 font-medium">Estado</th>
                <th className="px-3 py-2.5 font-medium text-right">Casos</th>
                <th className="px-3 py-2.5 font-medium w-[28%]">Resultados</th>
                <th className="px-3 py-2.5 font-medium text-right">Aprobado</th>
                <th className="px-3 py-2.5 font-medium text-right">Automatizado</th>
                <th className="px-4 py-2.5 font-medium text-right">Defectos</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(({ req, cases }) => {
                const isOpen = expanded.has(req.key) || (!!q && cases.length < req.cases.length);
                const total = req.cases.length;
                const meta = HEALTH_META[req.health];
                return (
                  <Fragment key={req.key}>
                    <tr
                      onClick={() => toggle(req.key)}
                      className={cn(
                        "border-b border-slate-100 cursor-pointer hover:bg-slate-50",
                        isOpen && "bg-slate-50/60"
                      )}
                    >
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-2 font-mono font-medium text-slate-900">
                          <ChevronRight
                            size={15}
                            aria-hidden
                            className={cn("text-slate-400 transition-transform", isOpen && "rotate-90")}
                          />
                          {req.key}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge tone={meta.tone} icon={meta.icon}>
                          {meta.label}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{total}</td>
                      <td className="px-3 py-2.5">
                        <ResultsBar counts={req.counts} total={total} />
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-medium text-slate-800">
                        {Math.round((req.counts.passed / total) * 100)}%
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                        {req.automated}/{total}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {req.openDefects > 0 ? (
                          <Badge tone="danger" icon={Bug}>
                            {req.openDefects}
                          </Badge>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-slate-100 bg-slate-50/40">
                        <td colSpan={7} className="p-0">
                          <CaseRows cases={cases} projectId={projectId} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {data.unassigned.length > 0 && (
        <Card padded={false}>
          <button
            type="button"
            onClick={() => setShowUnassigned((v) => !v)}
            aria-expanded={showUnassigned}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
          >
            <span className="flex items-center gap-2 min-w-0">
              <ChevronRight
                size={15}
                aria-hidden
                className={cn("shrink-0 text-slate-400 transition-transform", showUnassigned && "rotate-90")}
              />
              <Tag size={15} className="shrink-0 text-amber-500" aria-hidden />
              <span className="text-sm font-medium text-slate-800">
                Casos sin requisito ({data.unassigned.length})
              </span>
              <span className="hidden md:inline text-xs text-slate-500 truncate">
                · Dales un código como TC-RF020-06 para que entren en la matriz.
              </span>
            </span>
          </button>
          {showUnassigned && (
            <div className="border-t border-slate-100">
              <CaseRows
                cases={
                  q
                    ? data.unassigned.filter(
                        (c) => matches(c.title, q) || (c.code && matches(c.code, q))
                      )
                    : data.unassigned
                }
                projectId={projectId}
              />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
