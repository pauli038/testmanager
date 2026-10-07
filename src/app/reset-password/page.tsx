"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthShell from "@/components/AuthShell";
import { Button, Input, Label } from "@/components/ui";

function ResetPasswordForm() {
  const token = useSearchParams().get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Las contraseñas no coinciden");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/password-reset/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "No se pudo cambiar la contraseña");
      return;
    }
    setDone(true);
  }

  if (!token) {
    return (
      <p className="text-sm text-slate-600">
        El enlace está incompleto.{" "}
        <Link href="/forgot-password" className="text-brand-600 hover:underline">
          Solicita uno nuevo
        </Link>
        .
      </p>
    );
  }

  if (done) {
    return (
      <p className="text-sm text-slate-600">
        Tu contraseña se cambió correctamente.{" "}
        <Link href="/login" className="text-brand-600 hover:underline">
          Inicia sesión
        </Link>
        .
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Nueva contraseña</Label>
        <Input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div>
        <Label>Confirmar contraseña</Label>
        <Input
          type="password"
          required
          minLength={6}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button
        fullWidth
        type="submit"
        loading={loading}
      >
        Cambiar contraseña
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell title="Nueva contraseña">
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
