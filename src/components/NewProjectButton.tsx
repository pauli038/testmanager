"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewProjectButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      if (res.status === 401) {
        setError("Tu sesión expiró. Vuelve a iniciar sesión.");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "No se pudo crear el proyecto. Intenta de nuevo.");
        return;
      }
      const project = await res.json();
      setOpen(false);
      setName("");
      setDescription("");
      router.push(`/projects/${project.id}`);
    } catch {
      setError("No se pudo conectar con el servidor. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  function close() {
    setOpen(false);
    setError("");
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-teal-600 text-white text-sm font-medium px-4 py-2 hover:bg-teal-700"
      >
        + Nuevo proyecto
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              Nuevo proyecto
            </h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-700 mb-1">
                  Nombre
                </label>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-700 mb-1">
                  Descripción
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  rows={3}
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={close}
                  className="text-sm text-slate-600 px-4 py-2 hover:text-slate-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-teal-600 text-white text-sm font-medium px-4 py-2 hover:bg-teal-700 disabled:opacity-50"
                >
                  {loading ? "Creando..." : "Crear"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
