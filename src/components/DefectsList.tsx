"use client";

import { useState } from "react";
import ConfirmModal from "./ConfirmModal";

type Defect = {
  id: string;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  createdAt: string;
};

const severityColors: Record<string, string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const statusColors: Record<string, string> = {
  open: "bg-red-100 text-red-700",
  in_progress: "bg-amber-100 text-amber-700",
  closed: "bg-emerald-100 text-emerald-700",
};

const statusLabels: Record<string, string> = {
  open: "Abierto",
  in_progress: "En progreso",
  closed: "Cerrado",
};

export default function DefectsList({
  projectId,
  initialDefects,
}: {
  projectId: string;
  initialDefects: Defect[];
}) {
  const [defects, setDefects] = useState(initialDefects);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/projects/${projectId}/defects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, severity }),
    });
    if (res.ok) {
      const newDefect = await res.json();
      setDefects((d) => [newDefect, ...d]);
      setTitle("");
      setDescription("");
      setOpen(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    setDefects((d) => d.map((x) => (x.id === id ? { ...x, status } : x)));
    await fetch(`/api/defects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }

  async function remove(id: string) {
    await fetch(`/api/defects/${id}`, { method: "DELETE" });
    setDefects((d) => d.filter((x) => x.id !== id));
    setPendingDelete(null);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-slate-700">Defectos / Bugs</h3>
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg bg-teal-600 text-white text-sm font-medium px-3 py-1.5 hover:bg-teal-700"
        >
          + Nuevo defecto
        </button>
      </div>

      <div className="space-y-2">
        {defects.map((d) => (
          <div key={d.id} className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-medium text-slate-900 text-sm">🐞 {d.title}</h4>
                {d.description && (
                  <p className="text-sm text-slate-500 mt-1">{d.description}</p>
                )}
                <div className="flex gap-2 mt-2">
                  <span className={`text-xs rounded px-1.5 py-0.5 ${severityColors[d.severity]}`}>
                    {d.severity}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={d.status}
                  onChange={(e) => updateStatus(d.id, e.target.value)}
                  className={`text-xs rounded px-2 py-1 border-0 ${statusColors[d.status]}`}
                >
                  <option value="open">Abierto</option>
                  <option value="in_progress">En progreso</option>
                  <option value="closed">Cerrado</option>
                </select>
                <button
                  onClick={() => setPendingDelete(d.id)}
                  className="text-xs text-slate-400 hover:text-red-600"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        ))}
        {defects.length === 0 && (
          <p className="text-sm text-slate-400 py-10 text-center border border-dashed border-slate-300 rounded-xl">
            No hay defectos reportados. También puedes crearlos directamente desde un test run al marcar un caso como Failed.
          </p>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Nuevo defecto</h2>
            <form onSubmit={create} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-700 mb-1">Título</label>
                <input
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-700 mb-1">Descripción</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-700 mb-1">Severidad</label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
                >
                  <option value="low">Baja</option>
                  <option value="medium">Media</option>
                  <option value="high">Alta</option>
                  <option value="critical">Crítica</option>
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-sm text-slate-600 px-4 py-2"
                >
                  Cancelar
                </button>
                <button className="rounded-lg bg-teal-600 text-white text-sm font-medium px-4 py-2 hover:bg-teal-700">
                  Crear
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={pendingDelete !== null}
        message="¿Eliminar este defecto?"
        onConfirm={() => pendingDelete && remove(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
