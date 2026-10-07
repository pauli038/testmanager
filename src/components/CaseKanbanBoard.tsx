"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  AutomatedBadge,
  Badge,
  Button,
  EmptyState,
  IconButton,
  Input,
  Modal,
  PriorityBadge,
  Select,
  STATUS_META,
  type RunStatus,
} from "@/components/ui";
import { ChevronDown, ChevronUp, Columns3, Folder, Plus, Settings2, Trash2, X } from "lucide-react";
import ConfirmModal from "./ConfirmModal";

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

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-6 h-6 rounded-full border border-slate-300 ${COLOR_DOT[value] || "bg-slate-400"}`}
        title="Elegir color"
      />
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 mt-1 z-20 bg-white border border-slate-200 rounded-lg shadow-lg p-2 grid grid-cols-5 gap-1.5 w-36">
            {COLOR_CHOICES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
                className={`w-5 h-5 rounded-full ${COLOR_DOT[c]} ${
                  value === c ? "ring-2 ring-offset-1 ring-slate-400" : ""
                }`}
                title={c}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const isRunStatus = (s: string | null | undefined): s is RunStatus =>
  s === "passed" || s === "failed" || s === "blocked" || s === "skipped";

export default function CaseKanbanBoard({
  projectId,
  initialColumns,
  initialCases,
  headerActionsContainer,
}: {
  projectId: string;
  initialColumns: KanbanColumn[];
  initialCases: KanbanCase[];
  headerActionsContainer?: HTMLDivElement | null;
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
  const [suiteFilter, setSuiteFilter] = useState("");
  const [automationFilter, setAutomationFilter] = useState<"" | "manual" | "automated">("");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [selectedToAdd, setSelectedToAdd] = useState<Set<string>>(new Set());
  const [addTargetColumn, setAddTargetColumn] = useState("");

  const suiteOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of cases) map.set(c.suiteId, c.suiteName);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [cases]);

  const matchesFilters = (c: KanbanCase) => {
    if (suiteFilter && c.suiteId !== suiteFilter) return false;
    if (automationFilter === "manual" && c.automated) return false;
    if (automationFilter === "automated" && !c.automated) return false;
    return true;
  };

  const visibleCases = cases.filter(matchesFilters);
  const unassignedCases = cases.filter((c) => !c.phase && matchesFilters(c));

  function toggleSelectedToAdd(id: string) {
    setSelectedToAdd((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openAddModal() {
    setSelectedToAdd(new Set());
    setAddTargetColumn(columns[0]?.key || "");
    setAddModalOpen(true);
  }

  async function addSelectedToBoard() {
    const targetColumn = addTargetColumn || columns[0]?.key;
    if (!targetColumn || selectedToAdd.size === 0) return;
    const ids = [...selectedToAdd];
    setCases((prev) => prev.map((c) => (ids.includes(c.id) ? { ...c, phase: targetColumn } : c)));
    setAddModalOpen(false);
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/cases/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phase: targetColumn }),
        })
      )
    );
  }

  async function removeFromBoard(caseId: string) {
    setCases((prev) => prev.map((c) => (c.id === caseId ? { ...c, phase: null } : c)));
    await fetch(`/api/cases/${caseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase: null }),
    });
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

  const headerActions = (
    <>
      <Button icon={Plus}
        size="sm"
        onClick={openAddModal}
      >
        Agregar casos {unassignedCases.length > 0 && `(${unassignedCases.length})`}
      </Button>
      <Button variant="secondary" size="sm" icon={Settings2} onClick={() => setConfigOpen((v) => !v)}>
        {configOpen ? "Cerrar configuración" : "Configurar columnas"}
      </Button>
    </>
  );

  return (
    <div>
      {headerActionsContainer && createPortal(headerActions, headerActionsContainer)}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Select
            value={suiteFilter}
            onChange={(e) => setSuiteFilter(e.target.value)}
            className="text-slate-700 w-auto h-8"
          >
            <option value="">Todas las suites</option>
            {suiteOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
          <Select
            value={automationFilter}
            onChange={(e) => setAutomationFilter(e.target.value as "" | "manual" | "automated")}
            className="text-slate-700 w-auto h-8"
          >
            <option value="">Manual y automatizado</option>
            <option value="manual">Solo manual</option>
            <option value="automated">Solo automatizado</option>
          </Select>
        </div>
        {!headerActionsContainer && <div className="flex items-center gap-2">{headerActions}</div>}
      </div>

      {configOpen && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 mb-4">
          <h3 className="text-sm font-medium text-slate-700 mb-3">Fases del ciclo de QA</h3>
          <div className="space-y-2 mb-4">
            {columns.map((col, i) => (
              <div key={col.id} className="flex items-center gap-2">
                <div className="flex">
                  <IconButton
                    icon={ChevronUp}
                    label="Mover antes"
                    size="sm"
                    disabled={i === 0}
                    onClick={() => reorderColumn(col.id, -1)}
                  />
                  <IconButton
                    icon={ChevronDown}
                    label="Mover después"
                    size="sm"
                    disabled={i === columns.length - 1}
                    onClick={() => reorderColumn(col.id, 1)}
                  />
                </div>
                <ColorPicker value={col.color} onChange={(color) => recolorColumn(col.id, color)} />
                <Input
                  value={col.label}
                  onChange={(e) => renameColumn(col.id, e.target.value)}
                  className="flex-1 h-8"
                />
                <IconButton
                  icon={Trash2}
                  label="Eliminar fase"
                  tone="danger"
                  onClick={() => setPendingDeleteColumn(col)}
                />
              </div>
            ))}
          </div>
          <form onSubmit={addColumn} className="flex items-center gap-2 pt-3 border-t border-slate-100">
            <ColorPicker value={newColumnColor} onChange={setNewColumnColor} />
            <Input
              value={newColumnLabel}
              onChange={(e) => setNewColumnLabel(e.target.value)}
              placeholder="Nueva fase (ej. Regresión)"
              className="flex-1 h-8"
            />
            <Button icon={Plus} size="sm" type="submit">
              Agregar
            </Button>
          </form>
        </div>
      )}

      {columns.length === 0 ? (
        <EmptyState
          icon={Columns3}
          title="No hay fases configuradas"
          description="Usa “Configurar columnas” para crear la primera."
        />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {columns.map((col) => {
            const colCases = visibleCases.filter((c) => c.phase === col.key);
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
                    ? "border-brand-400 bg-brand-50/40"
                    : "border-slate-200 bg-slate-100/60"
                } transition-colors`}
              >
                <div className="flex items-center justify-between px-3 py-2.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-600 flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${COLOR_DOT[col.color] || "bg-slate-400"}`} />
                    {col.label}
                  </span>
                  <span className="text-xs font-medium tabular-nums text-slate-500 bg-white rounded-full px-2 py-0.5 ring-1 ring-slate-200">
                    {colCases.length}
                  </span>
                </div>
                <div className="p-2 space-y-2 min-h-[80px]">
                  {colCases.map((c) => (
                    <div
                      key={c.id}
                      draggable
                      onDragStart={() => setDragId(c.id)}
                      onDragEnd={() => setDragId(null)}
                      onClick={() => router.push(`/projects/${projectId}/suites`)}
                      className="group bg-white border border-slate-200 rounded-lg p-3 shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md hover:border-brand-300 transition"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-medium text-slate-900 text-sm leading-snug">{c.title}</h3>
                        <IconButton
                          icon={X}
                          label="Quitar del kanban"
                          size="sm"
                          tone="danger"
                          className="opacity-0 group-hover:opacity-100 -mr-1 -mt-0.5"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFromBoard(c.id);
                          }}
                        />
                      </div>
                      <div className="mt-2 flex items-center gap-1 flex-wrap">
                        <Badge icon={Folder} className="max-w-full truncate">
                          {c.suiteName}
                        </Badge>
                        <PriorityBadge priority={c.priority} />
                        {c.automated && <AutomatedBadge label="Auto" />}
                        {isRunStatus(c.lastStatus) && (
                          <Badge
                            tone={STATUS_META[c.lastStatus].tone}
                            icon={STATUS_META[c.lastStatus].icon}
                            title={STATUS_META[c.lastStatus].label}
                            aria-label={STATUS_META[c.lastStatus].label}
                          />
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

      <ConfirmModal
        open={pendingDeleteColumn !== null}
        title="¿Eliminar esta fase?"
        message={`Los casos en "${pendingDeleteColumn?.label ?? ""}" pasarán a la primera fase disponible.`}
        onConfirm={() => pendingDeleteColumn && deleteColumn(pendingDeleteColumn)}
        onCancel={() => setPendingDeleteColumn(null)}
      />

      {addModalOpen && (
        <Modal
          onClose={() => setAddModalOpen(false)}
          title="Agregar casos al Kanban"
          description="Elegí los casos que querés que aparezcan en el tablero."
        >

            {unassignedCases.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center border border-dashed border-slate-300 rounded-xl">
                {suiteFilter || automationFilter
                  ? "No hay casos sin agregar que coincidan con el filtro actual."
                  : "Todos los casos ya están en el tablero."}
              </p>
            ) : (
              <div className="space-y-1 max-h-72 overflow-y-auto border border-slate-200 rounded-lg p-2 mb-4">
                {unassignedCases.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-2 px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50 rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedToAdd.has(c.id)}
                      onChange={() => toggleSelectedToAdd(c.id)}
                      className="accent-brand-600"
                    />
                    <span className="flex-1">{c.title}</span>
                    <span className="text-xs text-slate-400 shrink-0 truncate max-w-32">{c.suiteName}</span>
                  </label>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-600">Fase inicial</label>
                <Select
                  value={addTargetColumn}
                  onChange={(e) => setAddTargetColumn(e.target.value)}
                  className="w-auto h-8"
                >
                  {columns.map((col) => (
                    <option key={col.id} value={col.key}>
                      {col.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setAddModalOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={addSelectedToBoard}
                  disabled={selectedToAdd.size === 0}
                >
                  Agregar ({selectedToAdd.size})
                </Button>
              </div>
            </div>
        </Modal>
      )}
    </div>
  );
}
