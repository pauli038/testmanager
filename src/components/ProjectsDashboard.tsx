"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export type DashboardProject = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  progress: number;
  creatorName: string | null;
  memberCount: number;
  cases: number;
  runs: number;
};

const STATUS_CONFIG: { key: string; label: string; dot: string }[] = [
  { key: "backlog", label: "Backlog", dot: "bg-slate-400" },
  { key: "analisis", label: "Análisis", dot: "bg-blue-500" },
  { key: "desarrollo", label: "Desarrollo", dot: "bg-amber-500" },
  { key: "code_review", label: "Code Review", dot: "bg-orange-500" },
  { key: "testing_qa", label: "Testing/QA", dot: "bg-purple-500" },
  { key: "uat", label: "UAT", dot: "bg-cyan-500" },
  { key: "done", label: "Completado", dot: "bg-emerald-500" },
];

function progressColor(pct: number) {
  if (pct >= 90) return "bg-emerald-500";
  if (pct >= 50) return "bg-blue-500";
  return "bg-amber-500";
}

const COLUMNS_STORAGE_KEY = "tm_kanban_columns";

export default function ProjectsDashboard({
  initialProjects,
}: {
  initialProjects: DashboardProject[];
}) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [view, setView] = useState<"list" | "kanban">("kanban");
  const [search, setSearch] = useState("");
  const [implementer, setImplementer] = useState("");
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    () => new Set(STATUS_CONFIG.map((s) => s.key))
  );
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [editing, setEditing] = useState<DashboardProject | null>(null);

  useEffect(() => {
    Promise.resolve().then(() => {
      try {
        const raw = localStorage.getItem(COLUMNS_STORAGE_KEY);
        if (raw) setVisibleColumns(new Set(JSON.parse(raw)));
      } catch {
        // ignore malformed/unavailable storage
      }
    });
  }, []);

  function toggleColumn(key: string) {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // ignore
      }
      return next;
    });
  }

  const implementers = useMemo(() => {
    const names = new Set(projects.map((p) => p.creatorName).filter(Boolean) as string[]);
    return [...names].sort();
  }, [projects]);

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (implementer && p.creatorName !== implementer) return false;
      return true;
    });
  }, [projects, search, implementer]);

  async function updateProject(id: string, patch: Partial<DashboardProject>) {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  function handleDrop(status: string) {
    if (dragId) updateProject(dragId, { status });
    setDragId(null);
    setDragOverCol(null);
  }

  return (
    <div id="projects-dashboard-print">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <span className="text-xs font-medium bg-blue-100 text-blue-700 rounded-full px-3 py-1">
          {filtered.length} {filtered.length === 1 ? "registro" : "registros"}
        </span>
        <div className="flex items-center gap-2 print:hidden">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            <button
              onClick={() => setView("list")}
              className={`text-sm font-medium px-3 py-1.5 flex items-center gap-1.5 ${
                view === "list" ? "bg-slate-100 text-slate-900" : "bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              ☰ Lista
            </button>
            <button
              onClick={() => setView("kanban")}
              className={`text-sm font-medium px-3 py-1.5 flex items-center gap-1.5 border-l border-slate-200 ${
                view === "kanban" ? "bg-slate-100 text-slate-900" : "bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              ▤ Kanban
            </button>
          </div>
          {view === "kanban" && (
            <div className="relative">
              <button
                onClick={() => setColumnsMenuOpen((v) => !v)}
                className="text-sm font-medium rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50"
              >
                ⚙ Configurar columnas
              </button>
              {columnsMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setColumnsMenuOpen(false)} />
                  <div className="absolute right-0 mt-1 w-52 bg-white border border-slate-200 rounded-lg shadow-lg z-20 p-2">
                    {STATUS_CONFIG.map((s) => (
                      <label
                        key={s.key}
                        className="flex items-center gap-2 px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50 rounded cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={visibleColumns.has(s.key)}
                          onChange={() => toggleColumn(s.key)}
                          className="accent-teal-600"
                        />
                        <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                        {s.label}
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          <button
            onClick={() => window.print()}
            className="text-sm font-medium rounded-lg bg-emerald-600 text-white px-3 py-1.5 hover:bg-emerald-700"
          >
            ⬇ Exportar PDF
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-6 flex-wrap print:hidden">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre..."
          className="flex-1 min-w-[220px] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
        <select
          value={implementer}
          onChange={(e) => setImplementer(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          <option value="">Todos los implementadores</option>
          {implementers.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-slate-300 rounded-xl">
          <p className="text-slate-500">
            {projects.length === 0 ? "Aún no tienes proyectos." : "Ningún proyecto coincide con este filtro."}
          </p>
        </div>
      ) : view === "list" ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Nombre</th>
                <th className="text-left px-4 py-2.5 font-medium">Estado</th>
                <th className="text-left px-4 py-2.5 font-medium">Progreso</th>
                <th className="text-left px-4 py-2.5 font-medium">Implementador</th>
                <th className="text-left px-4 py-2.5 font-medium">Equipo</th>
                <th className="text-right px-4 py-2.5 font-medium print:hidden">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((p) => {
                const cfg = STATUS_CONFIG.find((s) => s.key === p.status);
                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => router.push(`/projects/${p.id}`)}
                        className="font-medium text-slate-900 hover:text-teal-700 text-left"
                      >
                        {p.name}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                        <span className={`w-2 h-2 rounded-full ${cfg?.dot}`} />
                        {cfg?.label ?? p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 w-40">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${progressColor(p.progress)}`}
                            style={{ width: `${p.progress}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-500 w-8 text-right">{p.progress}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{p.creatorName || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">👥 {p.memberCount}</td>
                    <td className="px-4 py-3 text-right print:hidden">
                      <button
                        onClick={() => setEditing(p)}
                        className="text-xs font-medium rounded-lg px-2.5 py-1 bg-teal-50 text-teal-700 hover:bg-teal-100"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {STATUS_CONFIG.filter((s) => visibleColumns.has(s.key)).map((col) => {
            const colProjects = filtered.filter((p) => p.status === col.key);
            return (
              <div
                key={col.key}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverCol(col.key);
                }}
                onDragLeave={() => setDragOverCol((c) => (c === col.key ? null : c))}
                onDrop={() => handleDrop(col.key)}
                className={`shrink-0 w-72 rounded-xl border ${
                  dragOverCol === col.key ? "border-teal-400 bg-teal-50/40" : "border-slate-200 bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-200">
                  <span className="text-xs font-semibold uppercase text-slate-600 flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                    {col.label}
                  </span>
                  <span className="text-xs text-slate-400">{colProjects.length}</span>
                </div>
                <div className="p-2 space-y-2 min-h-[80px]">
                  {colProjects.map((p) => (
                    <div
                      key={p.id}
                      draggable
                      onDragStart={() => setDragId(p.id)}
                      onDragEnd={() => setDragId(null)}
                      onClick={() => router.push(`/projects/${p.id}`)}
                      className="bg-white border border-slate-200 rounded-lg p-3 cursor-pointer hover:shadow-md hover:border-teal-300 transition group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-medium text-slate-900 text-sm leading-snug">{p.name}</h3>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditing(p);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-teal-600 text-xs shrink-0"
                          title="Editar"
                        >
                          ✎
                        </button>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${progressColor(p.progress)}`}
                            style={{ width: `${p.progress}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-500">{p.progress}%</span>
                      </div>
                      <div className="mt-2.5 flex items-center justify-between text-xs text-slate-500">
                        <span className="truncate">{p.creatorName || "Sin asignar"}</span>
                        <span className="shrink-0 bg-slate-100 rounded px-1.5 py-0.5">
                          👥 {p.memberCount}
                        </span>
                      </div>
                    </div>
                  ))}
                  {colProjects.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-4">Sin proyectos</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Editar proyecto</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-700 mb-1">Nombre</label>
                <p className="text-sm text-slate-900 font-medium">{editing.name}</p>
              </div>
              <div>
                <label className="block text-sm text-slate-700 mb-1">Estado</label>
                <select
                  value={editing.status}
                  onChange={(e) => setEditing((v) => (v ? { ...v, status: e.target.value } : v))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {STATUS_CONFIG.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-700 mb-1">
                  Progreso: {editing.progress}%
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={editing.progress}
                  onChange={(e) =>
                    setEditing((v) => (v ? { ...v, progress: Number(e.target.value) } : v))
                  }
                  className="w-full accent-teal-600"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setEditing(null)}
                  className="text-sm text-slate-600 px-4 py-2 hover:text-slate-900"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    if (editing) updateProject(editing.id, { status: editing.status, progress: editing.progress });
                    setEditing(null);
                  }}
                  className="rounded-lg bg-teal-600 text-white text-sm font-medium px-4 py-2 hover:bg-teal-700"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
