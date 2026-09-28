"use client";

import { useState } from "react";

// Admin-only: generates a one-time password reset link for a user and shows
// it so it can be copied and handed over manually.
export default function ResetLinkButton({ userId }: { userId: string }) {
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setError("");
    setLoading(true);
    const res = await fetch(`/api/users/${userId}/reset-link`, { method: "POST" });
    setLoading(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "No se pudo generar el enlace");
      return;
    }
    setLink(data.link);
    setCopied(false);
  }

  async function copy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
  }

  if (link) {
    return (
      <div className="flex items-center gap-2 mt-2 w-full">
        <input
          readOnly
          value={link}
          onFocus={(e) => e.target.select()}
          className="flex-1 min-w-0 rounded border border-slate-300 px-2 py-1 text-xs text-slate-700"
        />
        <button onClick={copy} className="text-xs text-teal-600 hover:underline whitespace-nowrap">
          {copied ? "Copiado" : "Copiar"}
        </button>
        <span className="text-xs text-slate-400 whitespace-nowrap">Vence en 1 h</span>
      </div>
    );
  }

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        onClick={generate}
        disabled={loading}
        className="text-xs text-teal-600 hover:underline disabled:opacity-50"
      >
        {loading ? "Generando..." : "Enlace para restablecer contraseña"}
      </button>
    </span>
  );
}
