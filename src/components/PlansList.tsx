"use client";

import { useState } from "react";
import ConfirmModal from "./ConfirmModal";

type Plan = { id: string; name: string; description: string | null; createdAt: string };

export default function PlansList({
  projectId,
  initialPlans,
}: {
  projectId: string;
  initialPlans: Plan[];
}) {
  const [plans, setPlans] = useState(initialPlans);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [open, setOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/projects/${projectId}/plans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    if (res.ok) {
      const plan = await res.json();
      setPlans((p) => [plan, ...p]);
      setName("");
      setDescription("");
      setOpen(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/plans/${id}`, { method: "DELETE" });
    setPlans((p) => p.filter((x) => x.id !== id));
    setPendingDelete(null);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-slate-700">Planes de prueba</h3>
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg bg-indigo-600 text-white text-sm font-medium px-3 py-1.5 hover:bg-indigo-700"
        >
          + Nuevo plan
        </button>
      </div>

      <div className="space-y-2">
        {plans.map((p) => (
          <div
            key={p.id}
            className="bg-white border border-slate-200 rounded-lg p-4 flex items-start justify-between"
          >
            <div>
              <h4 className="font-medium text-slate-900 text-sm">{p.name}</h4>
              {p.description && (
                <p className="text-sm text-slate-500 mt-1">{p.description}</p>
              )}
            </div>
            <button
              onClick={() => setPendingDelete(p.id)}
              className="text-xs text-red-600 hover:underline"
            >
              Eliminar
            </button>
          </div>
        ))}
        {plans.length === 0 && (
          <p className="text-sm text-slate-400 py-10 text-center border border-dashed border-slate-300 rounded-xl">
            No hay planes todavía. Los planes agrupan test runs (ej. "Regresión v2.3").
          </p>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Nuevo plan</h2>
            <form onSubmit={create} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-700 mb-1">Nombre</label>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
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
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-sm text-slate-600 px-4 py-2"
                >
                  Cancelar
                </button>
                <button className="rounded-lg bg-indigo-600 text-white text-sm font-medium px-4 py-2 hover:bg-indigo-700">
                  Crear
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={pendingDelete !== null}
        message="¿Eliminar este plan?"
        onConfirm={() => pendingDelete && remove(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
