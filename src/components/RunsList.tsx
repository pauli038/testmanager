"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ConfirmModal from "./ConfirmModal";
import {
  Badge,
  Button,
  CodeBadge,
  EmptyState,
  IconButton,
  Input,
  Label,
  Modal,
  Segmented,
  errorMessage,
  useToast,
} from "@/components/ui";
import {
  Bot,
  CheckCircle2,
  Eye,
  Folder,
  Hand,
  Loader2,
  MoreHorizontal,
  PlayCircle,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";

type Suite = { id: string; name: string };
type CaseRef = { id: string; code: string | null; title: string };
type Run = {
  id: string;
  name: string;
  status: string;
  source: string;
  createdAt: string;
  stats: Record<string, number>;
  total: number;
};

const statusColors: Record<string, string> = {
  passed: "bg-emerald-500",
  failed: "bg-red-500",
  blocked: "bg-amber-500",
  skipped: "bg-cyan-500",
  untested: "bg-slate-200",
};

export default function RunsList({
  projectId,
  suites,
  casesBySuite,
}: {
  projectId: string;
  suites: Suite[];
  casesBySuite: Record<string, CaseRef[]>;
}) {
  const router = useRouter();
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sourceFilter, setSourceFilter] = useState<"all" | "manual" | "playwright">("all");
  const [dateFilter, setDateFilter] = useState("");
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [creating, setCreating] = useState(false);
  const toast = useToast();

  useEffect(() => {
    fetch(`/api/projects/${projectId}/runs`)
      .then((r) => r.json())
      .then((data) => {
        setRuns(data);
        setLoading(false);
      });
  }, [projectId]);

  useEffect(() => {
    if (!openMenu) return;
    function onClickOutside(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setOpenMenu(null);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [openMenu]);

  async function toggleRunStatus(id: string, currentStatus: string) {
    const status = currentStatus === "completed" ? "active" : "completed";
    setOpenMenu(null);
    const res = await fetch(`/api/runs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      toast.error(await errorMessage(res, "No se pudo cambiar el estado del run"));
      return;
    }
    setRuns((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));
    toast.success(status === "completed" ? "Run marcado como completado" : "Run reactivado");
  }

  async function removeRun(id: string) {
    setPendingDelete(null);
    const res = await fetch(`/api/runs/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(await errorMessage(res, "No se pudo eliminar el run"));
      return;
    }
    setRuns((rs) => rs.filter((r) => r.id !== id));
    toast.success("Run eliminado");
  }

  function toggleCase(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSuite(id: string) {
    const ids = (casesBySuite[id] || []).map((c) => c.id);
    setSelected((s) => {
      const next = new Set(s);
      const allSelected = ids.every((i) => next.has(i));
      ids.forEach((i) => (allSelected ? next.delete(i) : next.add(i)));
      return next;
    });
  }

  async function createRun(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    const res = await fetch(`/api/projects/${projectId}/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, caseIds: Array.from(selected) }),
    });
    if (!res.ok) {
      setCreating(false);
      toast.error(await errorMessage(res, "No se pudo crear el run"));
      return;
    }
    toast.success(`Run "${name}" creado`, `${selected.size} caso${selected.size === 1 ? "" : "s"}`);
    router.push(`/projects/${projectId}/runs/${(await res.json()).id}`);
  }

  function toLocalDateStr(iso: string) {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
  }

  const filteredRuns = runs.filter((r) => {
    if (sourceFilter !== "all" && r.source !== sourceFilter) return false;
    if (dateFilter && toLocalDateStr(r.createdAt) !== dateFilter) return false;
    return true;
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <Segmented
            value={sourceFilter}
            onChange={setSourceFilter}
            options={[
              { value: "all", label: "Todos" },
              { value: "manual", label: "Manual", icon: Hand },
              { value: "playwright", label: "Automatizado", icon: Bot },
            ]}
          />
          <div className="flex items-center gap-1">
            <Input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-auto h-8 text-slate-600"
              aria-label="Filtrar por fecha"
            />
            {dateFilter && (
              <IconButton icon={X} label="Quitar filtro de fecha" onClick={() => setDateFilter("")} />
            )}
          </div>
        </div>
        <Button icon={Plus}
          size="sm"
          onClick={() => setOpen(true)}
        >
          Nuevo run
        </Button>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 size={16} className="animate-spin" aria-hidden /> Cargando...
        </p>
      ) : filteredRuns.length === 0 ? (
        runs.length === 0 ? (
          <EmptyState
            icon={PlayCircle}
            title="No hay runs todavía"
            description="Crea un run manual para ejecutar casos, o conecta Playwright para que los resultados lleguen solos."
            action={
              <Button icon={Plus} size="sm" onClick={() => setOpen(true)}>
                Nuevo run
              </Button>
            }
          />
        ) : (
          <EmptyState title="No hay runs que coincidan con este filtro" />
        )
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto">
          <div className="min-w-[820px]">
            <div className="grid grid-cols-[2fr_110px_180px_90px_140px_40px] gap-3 items-center px-4 py-2.5 border-b border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-500 uppercase tracking-wide">
              <span>Nombre</span>
              <span>Estado</span>
              <span>Progreso</span>
              <span>Casos</span>
              <span>Creado</span>
              <span />
            </div>
            {filteredRuns.map((r) => {
              const pct = r.total > 0 ? Math.round(((r.stats.passed || 0) / r.total) * 100) : 0;
              return (
                <div
                  key={r.id}
                  className="grid grid-cols-[2fr_110px_180px_90px_140px_40px] gap-3 items-center px-4 py-3 border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/projects/${projectId}/runs/${r.id}`}
                      className="font-medium text-slate-900 text-sm hover:text-brand-700 hover:underline truncate block"
                    >
                      {r.name}
                    </Link>
                    {r.source === "playwright" ? (
                      <Badge tone="purple" icon={Bot} className="mt-1">
                        Playwright
                      </Badge>
                    ) : (
                      <Badge icon={Hand} className="mt-1">
                        Manual
                      </Badge>
                    )}
                  </div>
                  <span>
                    {r.status === "completed" ? (
                      <Badge icon={CheckCircle2}>Completado</Badge>
                    ) : (
                      <Badge tone="brand" icon={PlayCircle}>
                        Activo
                      </Badge>
                    )}
                  </span>
                  <div>
                    <div className="flex h-1.5 rounded-full overflow-hidden bg-slate-100">
                      {r.total > 0 &&
                        (["passed", "failed", "blocked", "skipped"] as const).map((k) =>
                          r.stats[k] ? (
                            <div
                              key={k}
                              className={statusColors[k]}
                              style={{ width: `${(r.stats[k] / r.total) * 100}%` }}
                            />
                          ) : null
                        )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      <span className="font-medium text-slate-700 tabular-nums">{pct}%</span> aprobado
                    </p>
                  </div>
                  <span className="text-xs text-slate-600 tabular-nums">{r.total} casos</span>
                  <span className="text-xs text-slate-500">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </span>
                  <div className="relative flex justify-end">
                    <IconButton
                      icon={MoreHorizontal}
                      label="Acciones"
                      onClick={() => setOpenMenu((m) => (m === r.id ? null : r.id))}
                    />
                    {openMenu === r.id && (
                      <div
                        ref={menuRef}
                        className="absolute right-0 top-9 z-10 w-48 bg-white rounded-xl shadow-lg ring-1 ring-slate-900/10 py-1 text-sm"
                      >
                        <button
                          onClick={() => router.push(`/projects/${projectId}/runs/${r.id}`)}
                          className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-slate-700 hover:bg-slate-50"
                        >
                          <Eye size={14} className="text-slate-400" aria-hidden />
                          Ver
                        </button>
                        <button
                          onClick={() => toggleRunStatus(r.id, r.status)}
                          className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-slate-700 hover:bg-slate-50"
                        >
                          {r.status === "completed" ? (
                            <RotateCcw size={14} className="text-slate-400" aria-hidden />
                          ) : (
                            <CheckCircle2 size={14} className="text-slate-400" aria-hidden />
                          )}
                          {r.status === "completed" ? "Reactivar" : "Marcar completado"}
                        </button>
                        <button
                          onClick={() => {
                            setOpenMenu(null);
                            setPendingDelete(r.id);
                          }}
                          className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-red-600 hover:bg-red-50"
                        >
                          <Trash2 size={14} aria-hidden />
                          Eliminar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {open && (
        <Modal onClose={() => setOpen(false)} title="Nuevo test run">
            <form onSubmit={createRun} className="space-y-4">
              <div>
                <Label>Nombre</Label>
                <Input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Regresión Sprint 24"
                />
              </div>
              <div>
                <Label className="mb-2">
                  Selecciona los casos a incluir ({selected.size})
                </Label>
                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-64 overflow-y-auto">
                  {suites.map((s) => (
                    <div key={s.id} className="p-2">
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(casesBySuite[s.id] || []).every((c) =>
                            selected.has(c.id)
                          ) && (casesBySuite[s.id] || []).length > 0}
                          onChange={() => toggleSuite(s.id)}
                        />
                        <Folder size={14} className="text-slate-400" aria-hidden />
                        {s.name}
                      </label>
                      <div className="pl-6 mt-1 space-y-1">
                        {(casesBySuite[s.id] || []).map((c) => (
                          <label
                            key={c.id}
                            className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={selected.has(c.id)}
                              onChange={() => toggleCase(c.id)}
                            />
                            <CodeBadge code={c.code} />
                            {c.title}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => setOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={selected.size === 0}
                  loading={creating}
                >
                  Crear run
                </Button>
              </div>
            </form>
        </Modal>
      )}

      <ConfirmModal
        open={pendingDelete !== null}
        message="¿Eliminar este test run? Se perderán los resultados de ejecución."
        onConfirm={() => pendingDelete && removeRun(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
