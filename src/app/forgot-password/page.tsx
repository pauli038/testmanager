"use client";

import { useState } from "react";
import Link from "next/link";
import AuthShell from "@/components/AuthShell";
import { Button, Input, Label } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<"sent" | "contact-admin" | null>(null);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setResult(data.emailEnabled ? "sent" : "contact-admin");
    } catch {
      setError("No se pudo procesar la solicitud. Intenta de nuevo.");
    }
    setLoading(false);
  }

  return (
    <AuthShell title="Recuperar contraseña">

      {result === "sent" && (
        <p className="text-sm text-slate-600">
          Si existe una cuenta con <strong>{email}</strong>, te enviamos un
          correo con un enlace para crear una contraseña nueva. El enlace vence
          en 1 hora. Revisa también la carpeta de spam.
        </p>
      )}

      {result === "contact-admin" && (
        <p className="text-sm text-slate-600">
          El envío de correos no está configurado. Pide a un administrador de
          Test Manager que te genere un enlace de restablecimiento desde{" "}
          la sección <em>Usuarios</em>.
        </p>
      )}

      {!result && (
        <>
          <p className="text-sm text-slate-500 mb-4">
            Escribe tu correo y te enviaremos un enlace para restablecerla.
          </p>
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
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button
              fullWidth
              type="submit"
              loading={loading}
            >
              Enviar enlace
            </Button>
          </form>
        </>
      )}

      <p className="text-sm text-slate-500 mt-6 text-center">
        <Link href="/login" className="text-brand-600 hover:underline">
          Volver a iniciar sesión
        </Link>
      </p>
    </AuthShell>
  );
}
