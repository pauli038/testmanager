"use client";

import { useState } from "react";
import Link from "next/link";

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
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm bg-white rounded-xl shadow p-8">
        <h1 className="text-xl font-semibold text-slate-900 mb-1">
          Recuperar contraseña
        </h1>

        {result === "sent" && (
          <p className="text-sm text-slate-600 mt-4">
            Si existe una cuenta con <strong>{email}</strong>, te enviamos un
            correo con un enlace para crear una contraseña nueva. El enlace vence
            en 1 hora. Revisa también la carpeta de spam.
          </p>
        )}

        {result === "contact-admin" && (
          <p className="text-sm text-slate-600 mt-4">
            El envío de correos no está configurado. Pide a un administrador de
            Test Manager que te genere un enlace de restablecimiento desde{" "}
            <em>Configuración → Usuarios del sistema</em>.
          </p>
        )}

        {!result && (
          <>
            <p className="text-sm text-slate-500 mb-6">
              Escribe tu correo y te enviaremos un enlace para restablecerla.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-700 mb-1">Correo</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-teal-600 text-white text-sm font-medium py-2 hover:bg-teal-700 disabled:opacity-50"
              >
                {loading ? "Enviando..." : "Enviar enlace"}
              </button>
            </form>
          </>
        )}

        <p className="text-sm text-slate-500 mt-4">
          <Link href="/login" className="text-teal-600 hover:underline">
            Volver a iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
