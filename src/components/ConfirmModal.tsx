"use client";

import { AlertTriangle } from "lucide-react";
import { Button, Modal } from "@/components/ui";

// Reusable confirmation modal used instead of the browser's native confirm().
// Keeps the "¿Eliminar...?" prompts visually consistent with the rest of the app.
export default function ConfirmModal({
  open,
  title = "¿Estás segura?",
  message,
  confirmLabel = "Eliminar",
  cancelLabel = "Cancelar",
  danger = true,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      size="sm"
      zIndex="z-[60]"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-4">
        {danger && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
            <AlertTriangle size={18} aria-hidden />
          </div>
        )}
        <div>
          <h2 className="text-base font-semibold text-slate-900 mb-1">{title}</h2>
          <p className="text-sm text-slate-600">{message}</p>
        </div>
      </div>
    </Modal>
  );
}
