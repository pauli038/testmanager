"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Modal, Textarea } from "@/components/ui";
import { Plus } from "lucide-react";

export default function NewProjectButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      if (res.status === 401) {
        setError("Tu sesión expiró. Vuelve a iniciar sesión.");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "No se pudo crear el proyecto. Intenta de nuevo.");
        return;
      }
      const project = await res.json();
      setOpen(false);
      setName("");
      setDescription("");
      router.push(`/projects/${project.id}`);
    } catch {
      setError("No se pudo conectar con el servidor. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  function close() {
    setOpen(false);
    setError("");
  }

  return (
    <>
      <Button icon={Plus}
        onClick={() => setOpen(true)}
      >
        Nuevo proyecto
      </Button>
      {open && (
        <Modal onClose={close} title="Nuevo proyecto">
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label>
                  Nombre
                </Label>
                <Input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <Label>
                  Descripción
                </Label>
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
                  onClick={close}
                >
                  Cancelar
                </Button>
                <Button type="submit" loading={loading}>
                  Crear
                </Button>
              </div>
            </form>
        </Modal>
      )}
    </>
  );
}
