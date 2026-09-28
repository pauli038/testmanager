"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ConfirmModal from "./ConfirmModal";

// Edit name/description (admin & lead) and delete the project (admin only).
// `children` is rendered between the two so the danger zone stays last.
export default function ProjectSettings({
  project,
  canEdit,
  canDelete,
  children,
}: {
  project: { id: string; name: string; description: string | null };
  canEdit: boolean;
  canDelete: boolean;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const dirty = name !== project.name || description !== (project.description || "");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "No se pudieron guardar los cambios" });
        return;
      }
      setMessage({ type: "ok", text: "Cambios guardados" });
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "No se pudo conectar con el servidor" });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setConfirmOpen(false);
    setDeleteError("");
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data.error || "No se pudo eliminar el proyecto");
        setDeleting(false);
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setDeleteError("No se pudo conectar con el servidor");
      setDeleting(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-slate-50 disabled:text-slate-500";

  return (
    <div className="space-y-10">
      <div>
        <h3 className="text-sm font-medium text-slate-700 mb-3">Proyecto</h3>
        <form
          onSubmit={save}
          className="bg-white border border-slate-200 rounded-lg p-4 space-y-4 max-w-xl"
        >
          <div>
            <label className="block text-sm text-slate-700 mb-1">Nombre</label>
            <input
              required
              disabled={!canEdit}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-700 mb-1">Descripción</label>
            <textarea
              rows={3}
              disabled={!canEdit}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputClass}
            />
          </div>
          {canEdit ? (
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving || !dirty}
                className="rounded-lg bg-teal-600 text-white text-sm font-medium px-4 py-2 hover:bg-teal-700 disabled:opacity-50"
              >
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
              {message && (
                <span
                  className={`text-sm ${message.type === "ok" ? "text-teal-700" : "text-red-600"}`}
                >
                  {message.text}
                </span>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-400">Solo un admin o lead puede editar el proyecto.</p>
          )}
        </form>
      </div>

      {children}

      {canDelete && (
        <div>
          <h3 className="text-sm font-medium text-red-700 mb-3">Zona de peligro</h3>
          <div className="bg-white border border-red-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4 max-w-xl">
            <div className="text-sm">
              <p className="text-slate-900 font-medium">Eliminar proyecto</p>
              <p className="text-slate-500">
                Borra el proyecto con todos sus casos, planes, runs, defectos y evidencias. No se
                puede deshacer.
              </p>
              {deleteError && <p className="text-red-600 mt-1">{deleteError}</p>}
            </div>
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={deleting}
              className="rounded-lg bg-red-600 text-white text-sm font-medium px-4 py-2 hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? "Eliminando..." : "Eliminar"}
            </button>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmOpen}
        title={`¿Eliminar "${project.name}"?`}
        message="Se borrarán todos sus casos, planes, runs, defectos y evidencias. Esta acción no se puede deshacer."
        confirmLabel="Eliminar proyecto"
        onConfirm={remove}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
