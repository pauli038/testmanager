"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ConfirmModal from "./ConfirmModal";

// Delete the project (admin only). `children` is rendered first so the danger zone stays last.
export default function ProjectSettings({
  project,
  canDelete,
  children,
}: {
  project: { id: string; name: string };
  canDelete: boolean;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

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

  return (
    <div className="space-y-10">
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
