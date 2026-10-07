"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Bot,
  Bug,
  ChevronRight,
  CircleX,
  Hand,
  Shuffle,
  Snail,
  TrendingDown,
} from "lucide-react";
import { AutomatedBadge, Badge, CodeBadge, EmptyState, Segmented, cn } from "@/components/ui";
import { STATUS_COLORS } from "@/lib/dashboard-colors";
import {
  STABILITY_WINDOW,
  type CaseStability,
  type RunOutcome,
  type StabilityData,
} from "@/lib/stability-shared";

type View = "flaky" | "always_failing" | "recently_broken" | "slow";
type Source = "all" | "automated" | "manual";

const VIEWS: Record<
  View,
  { label: string; icon: typeof Activity; iconClass: string; hint: string; empty: string }
> = {
  flaky: {
    label: "Inestables",
    icon: Shuffle,
    iconClass: "text-amber-500",
    hint: `Pasan y fallan sin un patrón claro (al menos 2 cambios en sus últimas ${STABILITY_WINDOW} ejecuciones). Suelen ser esperas o datos de prueba frágiles, no errores de la aplicación.`,
    empty: "Ningún caso alterna entre aprobado y fallido. ¡Bien!",
  },
  always_failing: {
    label: "Fallan siempre",
    icon: CircleX,
    iconClass: "text-red-500",
    hint: `3 o más ejecuciones seguidas sin aprobar ni una vez. Si es un defecto conocido de la aplicación, el test está haciendo su trabajo; si no, probablemente el test quedó desactualizado.`,
    empty: "No hay casos que fallen en todas sus ejecuciones.",
  },
  recently_broken: {
    label: "Rotos recientemente",
    icon: TrendingDown,
    iconClass: "text-orange-500",
    hint: "Aprobaban y su última ejecución falló. Conviene revisarlos primero: es lo que cambió hace poco.",
    empty: "Ningún caso empezó a fallar recientemente.",
  },
  slow: {
    label: "Más lentos",
    icon: Snail,
    iconClass: "text-slate-500",
    hint: `Tests automatizados ordenados por su duración típica (mediana de sus últimas ${STABILITY_WINDOW} ejecuciones).`,
    empty: "Todavía no hay tiempos de ejecución registrados.",
  },
};

const OUTCOME_LABEL: Record<RunOutcome, string> = {
  passed: "Aprobado",
  failed: "Fallido",
  blocked: "Bloqueado",
  skipped: "Omitido",
};

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1).replace(".", ",")} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${Math.round(s - m * 60)} s`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("es-CR", { dateStyle: "short", timeStyle: "short" });
}

// Last executions as dots, oldest → newest; each one links to its run.
function HistoryDots({ c, projectId }: { c: CaseStability; projectId: string }) {
  const pad = STABILITY_WINDOW - c.history.length;
  return (
    <div className="flex items-center gap-1" aria-label="Últimas ejecuciones, de la más antigua a la más reciente">
      {Array.from({ length: pad }, (_, i) => (
        <span key={`pad${i}`} className="h-3 w-3 rounded-full border border-dashed border-slate-200" />
      ))}
      {c.history.map((h) => (
        <Link
          key={h.runId}
          href={`/projects/${projectId}/runs/${h.runId}`}
          title={`${OUTCOME_LABEL[h.status]} · ${h.runName} · ${formatDate(h.executedAt)}`}
          className="h-3 w-3 rounded-full ring-offset-1 hover:ring-2 hover:ring-slate-400"
          style={{ backgroundColor: STATUS_COLORS[h.status] }}
        />
      ))}
    </div>
  );
}

function CaseRow({
  c,
  projectId,
  maxDuration,
  showDuration,
}: {
  c: CaseStability;
  projectId: string;
  maxDuration: number;
  showDuration: boolean;
}) {
  const [open, setOpen] = useState(false);
  const canExpand = !!c.lastError;
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={() => canExpand && setOpen((o) => !o)}
          aria-expanded={canExpand ? open : undefined}
          className={cn("flex min-w-0 flex-1 basis-72 items-center gap-2 text-left", !canExpand && "cursor-default")}
        >
          <ChevronRight
            size={15}
            aria-hidden
            className={cn(
              "shrink-0 text-slate-400 transition-transform",
              open && "rotate-90",
              !canExpand && "invisible"
            )}
          />
          <CodeBadge code={c.code} className="shrink-0" />
          <span className="truncate text-sm font-medium text-slate-900" title={c.title}>
            {c.title}
          </span>
          {c.automated && <AutomatedBadge label="Auto" className="shrink-0" />}
          {c.knownDefect && (
            <Badge tone="danger" icon={Bug} className="shrink-0">
              Defecto conocido
            </Badge>
          )}
        </button>

        {showDuration ? (
          <div className="flex w-full sm:w-64 items-center gap-2">
            <div className="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-slate-400"
                style={{ width: `${((c.medianDurationMs ?? 0) / maxDuration) * 100}%` }}
              />
            </div>
            <span className="w-20 text-right text-sm font-medium tabular-nums text-slate-800">
              {formatDuration(c.medianDurationMs ?? 0)}
            </span>
          </div>
        ) : (
          <>
            <HistoryDots c={c} projectId={projectId} />
            <div className="flex items-center gap-3 text-xs text-slate-500 tabular-nums">
              <span title="Aprobado en sus últimas ejecuciones">
                <span className="font-semibold text-slate-800">{c.passRate}%</span> aprobado
              </span>
              {c.failStreak > 0 && (
                <span className="text-red-600">
                  {c.failStreak} fallo{c.failStreak === 1 ? "" : "s"} seguido{c.failStreak === 1 ? "" : "s"}
                </span>
              )}
              {c.failStreak === 0 && c.flips > 0 && (
                <span>
                  {c.flips} cambio{c.flips === 1 ? "" : "s"}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {open && c.lastError && (
        <div className="mt-2 ml-6 rounded-lg border border-red-100 bg-red-50 p-3">
          <p className="mb-1 text-xs font-medium text-red-700">
            Último error
            {c.lastFailure && (
              <>
                {" · "}
                <Link
                  href={`/projects/${projectId}/runs/${c.lastFailure.runId}`}
                  className="underline hover:text-red-900"
                >
                  {c.lastFailure.runName}
                </Link>
                {" · "}
                {formatDate(c.lastFailure.executedAt)}
              </>
            )}
          </p>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap font-mono text-xs text-red-800">
            {c.lastError}
          </pre>
        </div>
      )}
    </li>
  );
}

export default function StabilityView({
  projectId,
  data,
}: {
  projectId: string;
  data: StabilityData;
}) {
  const [view, setView] = useState<View>("flaky");
  const [source, setSource] = useState<Source>("all");

  const lists = useMemo(() => {
    const cases = data.cases.filter(
      (c) => source === "all" || (source === "automated" ? c.automated : !c.automated)
    );
    return {
      flaky: cases.filter((c) => c.category === "flaky"),
      always_failing: cases.filter((c) => c.category === "always_failing"),
      recently_broken: cases.filter((c) => c.category === "recently_broken"),
      // Only automated tests report durations.
      slow: source === "manual" ? [] : data.slow,
    };
  }, [data, source]);

  if (data.cases.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="Todavía no hay ejecuciones"
        description="Cuando los casos se ejecuten en algunos runs, aquí verás cuáles fallan siempre, cuáles son inestables y cuáles son más lentos."
      />
    );
  }

  const current = lists[view];
  const meta = VIEWS[view];
  const maxDuration = Math.max(1, ...lists.slow.map((c) => c.medianDurationMs ?? 0));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">Estabilidad de los tests</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Basado en las últimas {STABILITY_WINDOW} ejecuciones de cada caso ({data.cases.length} casos
            con resultados).
          </p>
        </div>
        <Segmented
          value={source}
          onChange={setSource}
          options={[
            { value: "all", label: "Todos" },
            { value: "automated", label: "Automatizados", icon: Bot },
            { value: "manual", label: "Manuales", icon: Hand },
          ]}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(Object.keys(VIEWS) as View[]).map((v) => {
          const m = VIEWS[v];
          const active = view === v;
          const count = lists[v].length;
          return (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={active}
              className={cn(
                "text-left rounded-xl border bg-white p-4 shadow-sm transition-colors",
                active ? "border-brand-400 ring-2 ring-brand-500/20" : "border-slate-200 hover:border-slate-300"
              )}
            >
              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                <m.icon size={14} aria-hidden className={m.iconClass} />
                {m.label}
              </p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900 mt-1">
                {v === "slow" ? (lists.slow[0] ? formatDuration(lists.slow[0].medianDurationMs ?? 0) : "—") : count}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {v === "slow"
                  ? lists.slow[0]
                    ? "el más lento"
                    : "sin tiempos registrados"
                  : v === "always_failing" && count
                  ? `${lists.always_failing.filter((c) => c.knownDefect).length} por defectos conocidos`
                  : `caso${count === 1 ? "" : "s"}`}
              </p>
            </button>
          );
        })}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
        <div className="flex items-start gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50/60 rounded-t-xl">
          <meta.icon size={16} aria-hidden className={cn("mt-0.5 shrink-0", meta.iconClass)} />
          <p className="text-sm text-slate-600">{meta.hint}</p>
        </div>
        {current.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-400">{meta.empty}</p>
        ) : (
          <>
            {view !== "slow" && (
              <p className="px-4 pt-3 text-xs text-slate-400">
                Puntos: últimas ejecuciones, de la más antigua a la más reciente (clic para abrir el run).
                {current.some((c) => c.lastError) && " Abre un caso para ver su último error."}
              </p>
            )}
            <ul className="divide-y divide-slate-100">
              {current.map((c) => (
                <CaseRow
                  key={c.id}
                  c={c}
                  projectId={projectId}
                  maxDuration={maxDuration}
                  showDuration={view === "slow"}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
