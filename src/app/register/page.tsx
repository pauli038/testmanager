"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthShell from "@/components/AuthShell";
import { Button, Input, Label } from "@/components/ui";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Error al registrar");
      setLoading(false);
      return;
    }
    await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    router.push("/");
    router.refresh();
  }

  return (
    <AuthShell title="Crear cuenta" subtitle="El primer usuario registrado será administrador.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label>Nombre</Label>
          <Input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
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
          <Label>
            Contraseña
          </Label>
          <Input
            type="password"
            required
            minLength={6}
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
          Crear cuenta
        </Button>
      </form>
      <p className="text-sm text-slate-500 mt-6 text-center">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="text-brand-600 hover:underline">
          Inicia sesión
        </Link>
      </p>
    </AuthShell>
  );
}
