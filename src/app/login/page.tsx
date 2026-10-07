"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthShell from "@/components/AuthShell";
import { Button, Input, Label } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Correo o contraseña incorrectos");
      return;
    }
    router.push(params.get("callbackUrl") || "/");
    router.refresh();
  }

  return (
    <AuthShell title="Inicia sesión" subtitle="Ingresa con tu cuenta para continuar.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label>Correo</Label>
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <Label className="mb-0">Contraseña</Label>
            <Link
              href="/forgot-password"
              className="text-xs text-brand-600 hover:underline"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          <Input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button
          fullWidth
          type="submit"
          loading={loading}
        >
          Entrar
        </Button>
      </form>
      <p className="text-sm text-slate-500 mt-6 text-center">
        ¿No tienes cuenta?{" "}
        <Link href="/register" className="text-brand-600 hover:underline">
          Regístrate
        </Link>
      </p>
    </AuthShell>
  );
}
