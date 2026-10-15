"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bug, CornerDownLeft, FlaskConical, FolderKanban, Loader2, PlayCircle, Search } from "lucide-react";
import { CodeBadge, cn } from "@/components/ui";

type Results = {
  cases: { id: string; code: string | null; title: string; projectId: string; projectName: string }[];
  defects: {
    id: string;
    title: string;
    severity: string;
    status: string;
    projectId: string;
    projectName: string;
  }[];
  runs: { id: string; name: string; source: string; createdAt: string; projectId: string; projectName: string }[];
  projects: { id: string; name: string; description: string | null }[];
};

type Item = {
  key: string;
  group: string;
  icon: typeof Search;
  title: string;
  code?: string | null;
  detail: string;
  href: string;
};

const EMPTY: Results = { cases: [], defects: [], runs: [], projects: [] };
const SEVERITY: Record<string, string> = { low: "Baja", medium: "Media", high: "Alta", critical: "Crítica" };
const STATUS: Record<string, string> = { open: "Abierto", in_progress: "En progreso", closed: "Cerrado" };

function toItems(r: Results): Item[] {
  return [
    ...r.cases.map((c) => ({
      key: `c${c.id}`,
      group: "Casos de prueba",
      icon: FlaskConical,
      title: c.title,
      code: c.code,
      detail: c.projectName.trim(),
      href: `/projects/${c.projectId}/suites?case=${c.id}`,
    })),
    ...r.defects.map((d) => ({
      key: `d${d.id}`,
      group: "Defectos",
      icon: Bug,
      title: d.title,
      detail: `${d.projectName.trim()} · ${SEVERITY[d.severity] ?? d.severity} · ${STATUS[d.status] ?? d.status}`,
      href: `/projects/${d.projectId}/defects?defect=${d.id}`,
    })),
    ...r.runs.map((run) => ({
      key: `r${run.id}`,
      group: "Runs",
      icon: PlayCircle,
      title: run.name,
      detail: `${run.projectName.trim()} · ${run.source === "playwright" ? "Playwright" : "Manual"}`,
      href: `/projects/${run.projectId}/runs/${run.id}`,
    })),
    ...r.projects.map((p) => ({
      key: `p${p.id}`,
      group: "Proyectos",
      icon: FolderKanban,
      title: p.name.trim(),
      detail: p.description ?? "",
      href: `/projects/${p.id}`,
    })),
  ];
}

// Global search: Ctrl+K (⌘K on Mac) or the button in the navbar. Finds cases
// by code or title, defects, runs and projects; arrows + Enter to open.
export default function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const projectId = pathname.match(/^\/projects\/([^/]+)/)?.[1];
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const q = query.trim();
  // Under 2 letters nothing is searched; old results are just not shown.
  const items = useMemo(() => (q.length < 2 ? [] : toItems(results)), [q, results]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults(EMPTY);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Search as you type, a moment after the last keystroke.
  useEffect(() => {
    if (q.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      const params = new URLSearchParams({ q });
      if (projectId) params.set("projectId", projectId);
      fetch(`/api/search?${params}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : EMPTY))
        .then((data: Results) => {
          setResults(data);
          setActive(0);
          setLoading(false);
        })
        .catch(() => undefined);
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, projectId]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function go(item: Item | undefined) {
    if (!item) return;
    close();
    router.push(item.href);
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(items[active]);
    } else if (e.key === "Escape") {
      close();
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Buscar (Ctrl+K)"
        className="flex items-center gap-2 rounded-lg bg-white/10 px-2.5 h-8 text-sm text-brand-50 ring-1 ring-white/15 hover:bg-white/15 transition-colors dark:bg-slate-50 dark:text-slate-600 dark:ring-slate-200"
      >
        <Search size={15} aria-hidden />
        <span className="hidden md:inline">Buscar…</span>
        <kbd className="hidden md:inline rounded bg-white/15 px-1.5 text-[11px] font-sans text-white/80 dark:bg-slate-200 dark:text-slate-500">
          Ctrl K
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-900/40 dark:bg-black/60 backdrop-blur-[2px] p-3 sm:p-4 pt-[10vh]"
          onMouseDown={(e) => e.target === e.currentTarget && close()}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Búsqueda global"
            className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-900/10"
          >
            <div className="flex items-center gap-3 border-b border-slate-200 px-4">
              {loading ? (
                <Loader2 size={18} className="shrink-0 animate-spin text-slate-400" aria-hidden />
              ) : (
                <Search size={18} className="shrink-0 text-slate-400" aria-hidden />
              )}
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLoading(e.target.value.trim().length >= 2);
                }}
                onKeyDown={onInputKey}
                placeholder="Busca un caso (ej. TC-RF020-06), defecto, run o proyecto…"
                className="h-12 w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                role="combobox"
                aria-expanded={items.length > 0}
                aria-controls="busqueda-resultados"
                aria-activedescendant={items[active] ? `res-${items[active].key}` : undefined}
              />
              <kbd className="hidden sm:inline rounded border border-slate-200 px-1.5 text-[11px] text-slate-400">
                Esc
              </kbd>
            </div>

            <ul id="busqueda-resultados" ref={listRef} role="listbox" className="max-h-[60vh] overflow-y-auto py-2">
              {q.length < 2 ? (
                <li className="px-4 py-6 text-center text-sm text-slate-400">
                  Escribe al menos 2 letras. Busca en todos los proyectos
                  {projectId ? ", empezando por el actual" : ""}.
                </li>
              ) : items.length === 0 && !loading ? (
                <li className="px-4 py-6 text-center text-sm text-slate-400">
                  Nada coincide con “{q}”.
                </li>
              ) : (
                items.map((item, i) => (
                  <li key={item.key} role="presentation">
                    {(i === 0 || items[i - 1].group !== item.group) && (
                      <p className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        {item.group}
                      </p>
                    )}
                    <button
                      id={`res-${item.key}`}
                      role="option"
                      aria-selected={i === active}
                      data-index={i}
                      onMouseMove={() => setActive(i)}
                      onClick={() => go(item)}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-2 text-left",
                        i === active ? "bg-brand-50" : "hover:bg-slate-50"
                      )}
                    >
                      <item.icon
                        size={16}
                        aria-hidden
                        className={cn("shrink-0", i === active ? "text-brand-600" : "text-slate-400")}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <CodeBadge code={item.code} className="shrink-0" />
                          <span className="truncate text-sm text-slate-900">{item.title}</span>
                        </span>
                        {item.detail && <span className="block truncate text-xs text-slate-500">{item.detail}</span>}
                      </span>
                      {i === active && (
                        <CornerDownLeft size={14} className="shrink-0 text-slate-400" aria-hidden />
                      )}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
