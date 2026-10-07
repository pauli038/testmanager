"use client";

import { useState } from "react";
import ResetLinkButton from "./ResetLinkButton";
import { Badge, Button, IconButton, Input, Label, Modal, Select } from "@/components/ui";
import { Check, Copy, Plus, X } from "lucide-react";

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

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="flex justify-end">
          <Button icon={Plus}
            onClick={() => {
              setAdding(true);
              setAddError("");
            }}
          >
            Agregar usuario
          </Button>
        </div>
      )}

      {invite && (
        <div className="bg-brand-50 border border-brand-200 rounded-xl p-4 text-sm">
          <p className="text-slate-800">
            Usuario <strong>{invite.email}</strong> creado. Envíale este enlace para que defina su
            contraseña (vence en 1 hora; si vence, genera otro desde su fila):
          </p>
          <div className="flex items-center gap-2 mt-2">
            <Input
              readOnly
              value={invite.link}
              onFocus={(e) => e.target.select()}
              className="flex-1 min-w-0 text-xs text-slate-700 h-8"
            />
            <Button
              size="sm"
              variant="secondary"
              icon={copied ? Check : Copy}
              onClick={async () => {
                await navigator.clipboard.writeText(invite.link);
                setCopied(true);
              }}
            >
              {copied ? "Copiado" : "Copiar"}
            </Button>
            <IconButton icon={X} label="Cerrar" onClick={() => setInvite(null)} />
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm divide-y divide-slate-100">
        {users.map((u) => (
          <div key={u.id} className="px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 text-xs font-semibold ring-1 ring-brand-100">
                  {(u.name || u.email)
                    .split(/\s+/)
                    .map((w) => w[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </span>
                <div className="min-w-0">
                  <span className="text-slate-900 font-medium">{u.name}</span>
                  {u.id === currentUserId && (
                    <Badge tone="brand" className="ml-2">
                      Tú
                    </Badge>
                  )}
                  <div className="text-slate-500 truncate">{u.email}</div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {isAdmin && <ResetLinkButton userId={u.id} />}
                {isAdmin ? (
                  <Select
                    value={u.role}
                    onChange={(e) => changeRole(u.id, e.target.value as Role)}
                    aria-label={`Rol de ${u.name}`}
                    className="text-xs text-slate-700 w-auto h-8"
                  >
                    {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Badge>{ROLE_LABELS[u.role as Role] ?? u.role}</Badge>
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
        <Modal
          onClose={() => setAdding(false)}
          title="Agregar usuario"
          description="Se generará un enlace para que la persona defina su contraseña."
        >
            <form onSubmit={addUser} className="space-y-4">
              <div>
                <Label>Nombre</Label>
                <Input required value={name} onChange={(e) => setName(e.target.value)} />
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
                <Label>Rol</Label>
                <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>
              </div>
              {addError && <p className="text-sm text-red-600">{addError}</p>}
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => setAdding(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" loading={saving}>
                  Agregar
                </Button>
              </div>
            </form>
        </Modal>
      )}
    </div>
  );
}
