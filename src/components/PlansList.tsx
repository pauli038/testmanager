"use client";

import { useState } from "react";
import ConfirmModal from "./ConfirmModal";
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  Input,
  Label,
  Modal,
  Textarea,
  errorMessage,
  useToast,
} from "@/components/ui";
import { ClipboardList, Folder, Pencil, Plus, Trash2 } from "lucide-react";

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
  const toast = useToast();

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
    if (!res.ok) {
      toast.error(await errorMessage(res, "No se pudo guardar el plan"));
      return;
    }
    const saved = await res.json();
    toast.success(editingPlan ? "Plan actualizado" : "Plan creado", saved.name);
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

  async function remove(id: string) {
    setPendingDelete(null);
    const res = await fetch(`/api/plans/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(await errorMessage(res, "No se pudo eliminar el plan"));
      return;
    }
    setPlans((p) => p.filter((x) => x.id !== id));
    toast.success("Plan eliminado");
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-slate-700">Planes de prueba</h3>
        <Button icon={Plus}
          size="sm"
          onClick={openNew}
        >
          Nuevo plan
        </Button>
      </div>

      <div className="space-y-2">
        {plans.map((p) => (
          <div
            key={p.id}
            className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex items-start justify-between gap-4"
          >
            <div className="min-w-0">
              <h4 className="font-medium text-slate-900 text-sm">{p.name}</h4>
              {p.description && (
                <p className="text-sm text-slate-500 mt-1">{p.description}</p>
              )}
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                {p.suites.map((s) => (
                  <Badge key={s.id} icon={Folder}>
                    {s.name}
                  </Badge>
                ))}
                {p.suites.length === 0 && (
                  <span className="text-xs text-slate-400">Sin suites vinculadas</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <IconButton icon={Pencil} label="Editar plan" onClick={() => openEdit(p)} />
              <IconButton
                icon={Trash2}
                label="Eliminar plan"
                tone="danger"
                onClick={() => setPendingDelete(p.id)}
              />
            </div>
          </div>
        ))}
        {plans.length === 0 && (
          <EmptyState
            icon={ClipboardList}
            title="No hay planes todavía"
            description="Los planes agrupan test runs (ej. “Regresión v2.3”)."
            action={
              <Button icon={Plus} size="sm" onClick={openNew}>
                Nuevo plan
              </Button>
            }
          />
        )}
      </div>

      {open && (
        <Modal
          onClose={() => {
            setOpen(false);
            setEditingPlan(null);
          }}
          title={editingPlan ? "Editar plan" : "Nuevo plan"}
        >
            <form onSubmit={save} className="space-y-4">
              <div>
                <Label>Nombre</Label>
                <Input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <Label>Descripción</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div>
                <Label>Suites vinculadas</Label>
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
                        <Folder size={14} className="text-slate-400" aria-hidden />
                        {s.name}
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
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setEditingPlan(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button type="submit">
                  {editingPlan ? "Guardar" : "Crear"}
                </Button>
              </div>
            </form>
        </Modal>
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
