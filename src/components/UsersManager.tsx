"use client";

import { useState } from "react";
import ResetLinkButton from "./ResetLinkButton";

type Role = "admin" | "lead" | "tester";
type User = { id: string; name: string; email: string; role: Role; createdAt: string };

const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  lead: "Lead",
  tester: "Tester",
};

export default function UsersManager({
  initialUsers,
  currentUserId,
  isAdmin,
}: {
  initialUsers: User[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("tester");
  const [addError, setAddError] = useState("");
  const [saving, setSaving] = useState(false);
  const [invite, setInvite] = useState<{ email: string; link: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function changeRole(id: string, newRole: Role) {
    setRowError(null);
    const previous = users;
    setUsers((u) => u.map((x) => (x.id === id ? { ...x, role: newRole } : x)));
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setUsers(previous);
      setRowError({ id, message: data.error || "No se pudo cambiar el rol" });
    }
  }

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setAddError("");
    setSaving(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAddError(data.error || "No se pudo agregar el usuario");
        return;
      }
      setUsers((u) => [...u, data.user].sort((a, b) => a.name.localeCompare(b.name)));
      setInvite({ email: data.user.email, link: data.link });
      setCopied(false);
      setAdding(false);
      setName("");
      setEmail("");
      setRole("tester");
    } catch {
      setAddError("No se pudo conectar con el servidor");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500";

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="flex justify-end">
          <button
            onClick={() => {
              setAdding(true);
              setAddError("");
            }}
            className="rounded-lg bg-teal-600 text-white text-sm font-medium px-4 py-2 hover:bg-teal-700"
          >
            + Agregar usuario
          </button>
        </div>
      )}

      {invite && (
        <div className="bg-teal-50 border border-teal-200 rounded-lg p-4 text-sm">
          <p className="text-slate-800">
            Usuario <strong>{invite.email}</strong> creado. Envíale este enlace para que defina su
            contraseña (vence en 1 hora; si vence, genera otro desde su fila):
          </p>
          <div className="flex items-center gap-2 mt-2">
            <input
              readOnly
              value={invite.link}
              onFocus={(e) => e.target.select()}
              className="flex-1 min-w-0 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
            />
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(invite.link);
                setCopied(true);
              }}
              className="text-xs text-teal-700 hover:underline whitespace-nowrap"
            >
              {copied ? "Copiado" : "Copiar"}
            </button>
            <button
              onClick={() => setInvite(null)}
              className="text-xs text-slate-500 hover:text-slate-800"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
        {users.map((u) => (
          <div key={u.id} className="p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="min-w-0">
                <span className="text-slate-900 font-medium">{u.name}</span>
                {u.id === currentUserId && (
                  <span className="ml-2 text-xs text-slate-400">(tú)</span>
                )}
                <div className="text-slate-500 truncate">{u.email}</div>
              </div>
              <div className="flex items-center gap-4">
                {isAdmin && <ResetLinkButton userId={u.id} />}
                {isAdmin ? (
                  <select
                    value={u.role}
                    onChange={(e) => changeRole(u.id, e.target.value as Role)}
                    aria-label={`Rol de ${u.name}`}
                    className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs uppercase text-slate-500">{u.role}</span>
                )}
              </div>
            </div>
            {rowError?.id === u.id && (
              <p className="text-xs text-red-600 mt-2">{rowError.message}</p>
            )}
          </div>
        ))}
      </div>

      {adding && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-1">Agregar usuario</h2>
            <p className="text-sm text-slate-500 mb-4">
              Se generará un enlace para que la persona defina su contraseña.
            </p>
            <form onSubmit={addUser} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-700 mb-1">Nombre</label>
                <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm text-slate-700 mb-1">Correo</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm text-slate-700 mb-1">Rol</label>
                <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={inputClass}>
                  {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
              {addError && <p className="text-sm text-red-600">{addError}</p>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="text-sm text-slate-600 px-4 py-2 hover:text-slate-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-teal-600 text-white text-sm font-medium px-4 py-2 hover:bg-teal-700 disabled:opacity-50"
                >
                  {saving ? "Agregando..." : "Agregar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
