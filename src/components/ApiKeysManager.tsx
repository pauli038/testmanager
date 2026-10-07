"use client";

import { useState } from "react";
import ConfirmModal from "./ConfirmModal";
import { Button, EmptyState, IconButton, Input, errorMessage, useToast } from "@/components/ui";
import { Eye, EyeOff, KeyRound, Plus, Trash2 } from "lucide-react";

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
  const toast = useToast();

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/projects/${projectId}/api-keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      toast.error(await errorMessage(res, "No se pudo generar la API key"));
      return;
    }
    const key = await res.json();
    setKeys((k) => [...k, key]);
    setRevealed((r) => new Set(r).add(key.id));
    toast.success("API key generada", key.name);
  }

  async function removeKey(id: string) {
    setPendingDelete(null);
    const res = await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(await errorMessage(res, "No se pudo eliminar la API key"));
      return;
    }
    setKeys((k) => k.filter((x) => x.id !== id));
    toast.success("API key eliminada");
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
        este proyecto. Endpoint: <code className="bg-slate-100 px-1 rounded font-mono">{ingestUrl}</code>
      </p>

      <form onSubmit={createKey} className="flex gap-2 mb-4">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-auto"
        />
        <Button icon={Plus} type="submit">
          Generar API key
        </Button>
      </form>

      <div className="space-y-2">
        {keys.map((k) => (
          <div
            key={k.id}
            className="bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3 flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                <KeyRound size={15} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">{k.name}</p>
                <code className="text-xs text-slate-500 font-mono break-all">
                  {revealed.has(k.id) ? k.key : "tm_••••••••••••••••••••••••"}
                </code>
              </div>
            </div>
            <div className="flex gap-0.5 shrink-0">
              <IconButton
                icon={revealed.has(k.id) ? EyeOff : Eye}
                label={revealed.has(k.id) ? "Ocultar" : "Mostrar"}
                onClick={() => toggleReveal(k.id)}
              />
              <IconButton
                icon={Trash2}
                label="Eliminar API key"
                tone="danger"
                onClick={() => setPendingDelete(k.id)}
              />
            </div>
          </div>
        ))}
        {keys.length === 0 && (
          <EmptyState
            icon={KeyRound}
            title="No hay API keys todavía"
            description="Genera una para conectar Playwright."
            className="py-8"
          />
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
