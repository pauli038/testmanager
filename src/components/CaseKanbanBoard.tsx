"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type KanbanColumn = {
  id: string;
  key: string;
  label: string;
  color: string;
  position: number;
};

export type KanbanCase = {
  id: string;
  title: string;
  suiteId: string;
  suiteName: string;
  priority: string;
  automated: boolean;
  phase: string | null;
  lastStatus: string | null;
};

const COLOR_DOT: Record<string, string> = {
  slate: "bg-slate-400",
  blue: "bg-blue-500",
  amber: "bg-amber-500",
  orange: "bg-orange-500",
  purple: "bg-purple-500",
  emerald: "bg-emerald-500",
  cyan: "bg-cyan-500",
  red: "bg-red-500",
  pink: "bg-pink-500",
};

const COLOR_CHOICES = Object.keys(COLOR_DOT);

const priorityColors: Record<string, string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const lastStatusConfig: Record<string, { icon: string; classes: string }> = {
  passed: { icon: "✅", classes: "bg-emerald-100 text-emerald-700" },
  failed: { icon: "❌", classes: "bg-red-100 text-red-700" },
  blocked: { icon: "🚫", classes: "bg-orange-100 text-orange-700" },
  skipped: { icon: "⏭️", classes: "bg-slate-100 text-slate-500" },
};

export default function CaseKanbanBoard({
  projectId,
  initialColumns,
  initialCases,
}: {
  projectId: string;
  initialColumns: KanbanColumn[];
  initialCases: KanbanCase[];
}) {
  const router = useRouter();
  const [columns, setColumns] = useState(
    [...initialColumns].sort((a, b) => a.position - b.position)
  );
  const [cases, setCases] = useState(initialCases);
  const [configOpen, setConfigOpen] = useState(false);
  const [newColumnLabel, setNewColumnLabel] = useState("");
  const [newColumnColor, setNewColumnColor] = useState("slate");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [pendingDeleteColumn, setPendingDeleteColumn] = useState<KanbanColumn | null>(null);

  function unassignedKeyIsFirst() {
    return columns[0]?.key;
  }

  async function moveCase(caseId: string, phase: string) {
    setCases((prev) => prev.map((c) => (c.id === caseId ? { ...c, phase } : c)));
    await fetch(`/api/cases/${caseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase }),
    });
  }

  function handleDrop(columnKey: string) {
    if (dragId) moveCase(dragId, columnKey);
    setDragId(null);
    setDragOverCol(null);
  }

  async function addColumn(e: React.FormEvent) {
    e.preventDefault();
    if (!newColumnLabel.trim()) return;
    const res = await fetch(`/api/projects/${projectId}/kanban-columns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: newColumnLabel, color: newColumnColor }),
    });
    if (res.ok) {
      const column = await res.json();
      setColumns((prev) => [...prev, column]);
      setNewColumnLabel("");
      setNewColumnColor("slate");
    }
  }

  async function renameColumn(id: string, label: string) {
    setColumns((prev) => prev.map((c) => (c.id === id ? { ...c, label } : c)));
    await fetch(`/api/kanban-columns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
  }

  async function recolorColumn(id: string, color: string) {
    setColumns((prev) => prev.map((c) => (c.id === id ? { ...c, color } : c)));
    await fetch(`/api/kanban-columns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color }),
    });
  }

  async function reorderColumn(id: string, direction: -1 | 1) {
    const idx = columns.findIndex((c) => c.id === id);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= columns.length) return;
    const next = [...columns];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    setColumns(next);
    await Promise.all([
      fetch(`/api/kanban-columns/${next[idx].id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position: idx }),
      }),
      fetch(`/api/kanban-columns/${next[swapIdx].id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position: swapIdx }),
      }),
    ]);
  }

  async function deleteColumn(column: KanbanColumn) {
    const fallbackKey = columns.find((c) => c.id !== column.id)?.key ?? null;
    setColumns((prev) => prev.filter((c) => c.id !== column.id));
    setCases((prev) =>
      prev.map((c) => (c.phase === column.key ? { ...c, phase: fallbackKey } : c))
    );
    setPendingDeleteColumn(null);
    await fetch(`/api/kanban-columns/${column.id}`, { method: "DELETE" });
  }

  return (
    <div>
      <div className="flex items-center justify-end mb-4">
        <button
          onClick={() => setConfigOpen((v) => !v)}
          className="text-sm font-medium rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50"
        >
          ⚙ {configOpen ? "Cerrar configuración" : "Configurar columnas"}
        </button>
      </div>

      {configOpen && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
          <h3 className="text-sm font-medium text-slate-700 mb-3">Fases del ciclo de QA</h3>
          <div className="space-y-2 mb-4">
            {columns.map((col, i) => (
              <div key={col.id} className="flex items-center gap-2">
                <div className="flex gap-0.5">
                  <button
                    disabled={i === 0}
                    onClick={() => reorderColumn(col.id, -1)}
                    className="text-slate-400 hover:text-slate-700 disabled:opacity-20 text-xs w-5"
                  >
                    ▲
                  </button>
                  <button
                    disabled={i === columns.length - 1}
                    onClick={() => reorderColumn(col.id, 1)}
                    className="text-slate-400 hover:text-slate-700 disabled:opacity-20 text-xs w-5"
                  >
                    ▼
                  </button>
                </div>
                <select
                  value={col.color}
                  onChange={(e) => recolorColumn(col.id, e.target.value)}
                  className="border border-slate-200 rounded p-1"
                >
                  {COLOR_CHOICES.map((c) => (
                    <option key={c} value={c}>
                      ●
                    </option>
                  ))}
                </select>
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${COLOR_DOT[col.color]}`} />
                <input
                  value={col.label}
                  onChange={(e) => renameColumn(col.id, e.target.value)}
                  className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                />
                <button
                  onClick={() => setPendingDeleteColumn(col)}
                  className="text-slate-400 hover:text-red-600 text-xs px-2"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <form onSubmit={addColumn} className="flex items-center gap-2 pt-3 border-t border-slate-100">
            <select
              value={newColumnColor}
              onChange={(e) => setNewColumnColor(e.target.value)}
              className="border border-slate-200 rounded p-1"
            >
              {COLOR_CHOICES.map((c) => (
                <option key={c} value={c}>
                  ●
                </option>
              ))}
            </select>
            <input
              value={newColumnLabel}
              onChange={(e) => setNewColumnLabel(e.target.value)}
              placeholder="Nueva fase (ej. Regresión)"
              className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
            <button className="rounded-lg bg-teal-600 text-white text-sm font-medium px-3 py-1.5 hover:bg-teal-700">
              + Agregar
            </button>
          </form>
        </div>
      )}

      {columns.length === 0 ? (
        <p className="text-sm text-slate-400 py-10 text-center border border-dashed border-slate-300 rounded-xl">
          No hay fases configuradas. Usa &quot;Configurar columnas&quot; para crear la primera.
        </p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {columns.map((col) => {
            const colCases = cases.filter((c) =>
              c.phase ? c.phase === col.key : col.key === unassignedKeyIsFirst()
            );
            return (
              <div
                key={col.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverCol(col.key);
                }}
                onDragLeave={() => setDragOverCol((c) => (c === col.key ? null : c))}
                onDrop={() => handleDrop(col.key)}
                className={`shrink-0 w-72 rounded-xl border ${
                  dragOverCol === col.key
                    ? "border-teal-400 bg-teal-50/40"
                    : "border-slate-200 bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-200">
                  <span className="text-xs font-semibold uppercase text-slate-600 flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${COLOR_DOT[col.color] || "bg-slate-400"}`} />
                    {col.label}
                  </span>
                  <span className="text-xs text-slate-400">{colCases.length}</span>
                </div>
                <div className="p-2 space-y-2 min-h-[80px]">
                  {colCases.map((c) => (
                    <div
                      key={c.id}
                      draggable
                      onDragStart={() => setDragId(c.id)}
                      onDragEnd={() => setDragId(null)}
                      onClick={() => router.push(`/projects/${projectId}/suites`)}
                      className="bg-white border border-slate-200 rounded-lg p-3 cursor-pointer hover:shadow-md hover:border-teal-300 transition"
                    >
                      <h3 className="font-medium text-slate-900 text-sm leading-snug">{c.title}</h3>
                      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">
                          📁 {c.suiteName}
                        </span>
                        <span className={`text-xs rounded px-1.5 py-0.5 ${priorityColors[c.priority]}`}>
                          {c.priority}
                        </span>
                        {c.automated && (
                          <span className="text-xs bg-purple-100 text-purple-700 rounded px-1.5 py-0.5">
                            🤖
                          </span>
                        )}
                        {c.lastStatus && lastStatusConfig[c.lastStatus] && (
                          <span
                            className={`text-xs rounded px-1.5 py-0.5 ${lastStatusConfig[c.lastStatus].classes}`}
                          >
                            {lastStatusConfig[c.lastStatus].icon}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {colCases.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-4">Sin casos</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pendingDeleteColumn && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6">
            <h2 className="text-base font-semibold text-slate-900 mb-2">¿Eliminar esta fase?</h2>
            <p className="text-sm text-slate-600 mb-6">
              Los casos en &quot;{pendingDeleteColumn.label}&quot; pasarán a la primera fase disponible.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPendingDeleteColumn(null)}
                className="text-sm text-slate-600 px-4 py-2 hover:text-slate-900"
              >
                Cancelar
              </button>
              <button
                onClick={() => deleteColumn(pendingDeleteColumn)}
                className="rounded-lg bg-red-600 text-white text-sm font-medium px-4 py-2 hover:bg-red-700"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
