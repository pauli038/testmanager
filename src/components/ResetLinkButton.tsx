"use client";

import { useState } from "react";
import { Button, Input } from "@/components/ui";
import { Check, Copy, Link2 } from "lucide-react";

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
        <Input
          readOnly
          value={link}
          onFocus={(e) => e.target.select()}
          className="flex-1 min-w-0 text-xs text-slate-700 h-8"
        />
        <Button size="sm" variant="secondary" icon={copied ? Check : Copy} onClick={copy}>
          {copied ? "Copiado" : "Copiar"}
        </Button>
        <span className="text-xs text-slate-400 whitespace-nowrap">Vence en 1 h</span>
      </div>
    );
  }

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <Button size="xs" variant="ghost" icon={Link2} loading={loading} onClick={generate}>
        Enlace para restablecer contraseña
      </Button>
    </span>
  );
}
