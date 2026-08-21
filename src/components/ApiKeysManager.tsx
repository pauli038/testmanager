"use client";

import { useState } from "react";
import ConfirmModal from "./ConfirmModal";

type ApiKey = { id: string; name: string; key: string; createdAt: string };

export default function ApiKeysManager({
  projectId,
  initialKeys,
}: {
  projectId: string;
  initialKeys: ApiKey[];
}) {
  const [keys, setKeys] = useState(initialKeys);
  const [name, setName] = useState("Playwright CI");
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/projects/${projectId}/api-keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      const key = await res.json();
      setKeys((k) => [...k, key]);
      setRevealed((r) => new Set(r).add(key.id));
    }
  }

  async function removeKey(id: string) {
    await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
    setKeys((k) => k.filter((x) => x.id !== id));
    setPendingDelete(null);
  }

  function toggleReveal(id: string) {
    setRevealed((r) => {
      const next = new Set(r);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const ingestUrl =
    typeof window !== "undefined" ? `${window.location.origin}/api/ingest` : "/api/ingest";

  return (
    <div>
      <h3 className="text-sm font-medium text-slate-700 mb-1">
        API Keys · Integración con Playwright
      </h3>
      <p className="text-xs text-slate-500 mb-3">
        Usa una API key para que tus pruebas de Playwright manden resultados automáticamente a
        este proyecto. Endpoint: <code className="bg-slate-100 px-1 rounded">{ingestUrl}</code>
      </p>

      <form onSubmit={createKey} className="flex gap-2 mb-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button className="rounded-lg bg-teal-600 text-white text-sm font-medium px-3 py-2 hover:bg-teal-700">
          + Generar API key
        </button>
      </form>

      <div className="space-y-2">
        {keys.map((k) => (
          <div
            key={k.id}
            className="bg-white border border-slate-200 rounded-lg p-3 flex items-center justify-between"
          >
            <div>
              <p className="text-sm font-medium text-slate-900">{k.name}</p>
              <code className="text-xs text-slate-500">
                {revealed.has(k.id) ? k.key : "tm_••••••••••••••••••••••••"}
              </code>
            </div>
            <div className="flex gap-3 text-xs">
              <button
                onClick={() => toggleReveal(k.id)}
                className="text-teal-600 hover:underline"
              >
                {revealed.has(k.id) ? "Ocultar" : "Mostrar"}
              </button>
              <button
                onClick={() => setPendingDelete(k.id)}
                className="text-red-600 hover:underline"
              >
                Eliminar
              </button>
            </div>
          </div>
        ))}
        {keys.length === 0 && (
          <p className="text-sm text-slate-400 py-6 text-center border border-dashed border-slate-300 rounded-xl">
            No hay API keys todavía. Genera una para conectar Playwright.
          </p>
        )}
      </div>

      <ConfirmModal
        open={pendingDelete !== null}
        message="¿Eliminar esta API key? Cualquier integración que la use dejará de funcionar."
        onConfirm={() => pendingDelete && removeKey(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
