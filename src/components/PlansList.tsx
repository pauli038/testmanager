"use client";

import { useState } from "react";
import ConfirmModal from "./ConfirmModal";

type Suite = { id: string; name: string };
type Plan = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  suites: Suite[];
};

export default function PlansList({
  projectId,
  initialPlans,
  suites,
}: {
  projectId: string;
  initialPlans: Plan[];
  suites: Suite[];
}) {
  const [plans, setPlans] = useState(initialPlans);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [suiteIds, setSuiteIds] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  function openNew() {
    setEditingPlan(null);
    setName("");
    setDescription("");
    setSuiteIds([]);
    setOpen(true);
  }

  function openEdit(p: Plan) {
    setEditingPlan(p);
    setName(p.name);
    setDescription(p.description || "");
    setSuiteIds(p.suites.map((s) => s.id));
    setOpen(true);
  }

  function toggleSuite(id: string) {
    setSuiteIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const res = editingPlan
      ? await fetch(`/api/plans/${editingPlan.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, description, suiteIds }),
        })
      : await fetch(`/api/projects/${projectId}/plans`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, description, suiteIds }),
        });
    if (res.ok) {
      const saved = await res.json();
      if (editingPlan) {
        setPlans((p) => p.map((x) => (x.id === saved.id ? saved : x)));
      } else {
        setPlans((p) => [saved, ...p]);
      }
      setName("");
      setDescription("");
      setSuiteIds([]);
      setEditingPlan(null);
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
          onClick={openNew}
          className="rounded-lg bg-teal-600 text-white text-sm font-medium px-3 py-1.5 hover:bg-teal-700"
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
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                {p.suites.map((s) => (
                  <span
                    key={s.id}
                    className="text-xs bg-slate-50 border border-slate-200 text-slate-500 rounded px-1.5 py-0.5"
                  >
                    📁 {s.name}
                  </span>
                ))}
                {p.suites.length === 0 && (
                  <span className="text-xs text-slate-400">Sin suites vinculadas</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => openEdit(p)}
                className="text-xs font-medium rounded-lg px-2.5 py-1 bg-teal-50 text-teal-700 hover:bg-teal-100"
              >
                Editar
              </button>
              <button
                onClick={() => setPendingDelete(p.id)}
                className="text-xs font-medium rounded-lg px-2.5 py-1 bg-slate-100 text-slate-400 hover:bg-red-50 hover:text-red-600"
              >
                Eliminar
              </button>
            </div>
          </div>
        ))}
        {plans.length === 0 && (
          <p className="text-sm text-slate-400 py-10 text-center border border-dashed border-slate-300 rounded-xl">
            No hay planes todavía. Los planes agrupan test runs (ej. "Regresión v2.3").
          </p>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              {editingPlan ? "Editar plan" : "Nuevo plan"}
            </h2>
            <form onSubmit={save} className="space-y-4">
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
              <div>
                <label className="block text-sm text-slate-700 mb-1">Suites vinculadas</label>
                {suites.length > 0 ? (
                  <div className="border border-slate-200 rounded-lg max-h-40 overflow-y-auto divide-y divide-slate-100">
                    {suites.map((s) => (
                      <label
                        key={s.id}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 cursor-pointer hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={suiteIds.includes(s.id)}
                          onChange={() => toggleSuite(s.id)}
                        />
                        📁 {s.name}
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">
                    No hay suites en este proyecto todavía.
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setEditingPlan(null);
                  }}
                  className="text-sm text-slate-600 px-4 py-2"
                >
                  Cancelar
                </button>
                <button className="rounded-lg bg-teal-600 text-white text-sm font-medium px-4 py-2 hover:bg-teal-700">
                  {editingPlan ? "Guardar" : "Crear"}
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
