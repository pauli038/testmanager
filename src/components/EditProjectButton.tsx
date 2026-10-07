"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, IconButton, Input, Label, Modal, Textarea } from "@/components/ui";
import { Pencil } from "lucide-react";

export default function EditProjectButton({
  project,
}: {
  project: { id: string; name: string; description: string | null };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function openModal() {
    setName(project.name);
    setDescription(project.description || "");
    setError("");
    setOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      if (res.status === 401) {
        setError("Tu sesión expiró. Vuelve a iniciar sesión.");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "No se pudieron guardar los cambios");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <IconButton icon={Pencil} label="Editar proyecto" onClick={openModal} className="hover:!text-brand-700 hover:!bg-brand-50" />
      {open && (
        <Modal onClose={() => setOpen(false)} title="Editar proyecto">
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <Label>Nombre</Label>
                <Input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <Label>Descripción</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => setOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" loading={loading}>
                  Guardar
                </Button>
              </div>
            </form>
        </Modal>
      )}
    </>
  );
}
