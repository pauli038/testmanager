"use client";

import { useEffect, useState } from "react";
import { Button, Input, Label, Modal, Select } from "@/components/ui";
import { Bug } from "lucide-react";

const severityOptions = [
  { value: "low", label: "Baja" },
  { value: "medium", label: "Media" },
  { value: "high", label: "Alta" },
  { value: "critical", label: "Crítica" },
];

// Reusable modal used instead of the browser's native prompt() to report a
// defect from a run case. Keeps title/severity input visually consistent
// with the rest of the app.
export default function ReportDefectModal({
  open,
  caseTitle,
  submitting,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  caseTitle: string;
  submitting?: boolean;
  onConfirm: (title: string, severity: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState("high");

  useEffect(() => {
    if (open) {
      setTitle(caseTitle ? `Falla en "${caseTitle}"` : "");
      setSeverity("high");
    }
  }, [open, caseTitle]);

  const canSubmit = title.trim().length > 0 && !submitting;

  function submit() {
    if (!canSubmit) return;
    onConfirm(title.trim(), severity);
  }

  return (
    <Modal
      open={open}
      onClose={onCancel}
      size="sm"
      zIndex="z-[60]"
      title={
        <span className="flex items-center gap-2">
          <Bug size={16} className="text-red-600" aria-hidden />
          Reportar defecto
        </span>
      }
      description={
        <>
          Para el caso <span className="font-medium text-slate-700">&quot;{caseTitle}&quot;</span>
        </>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="danger" icon={Bug} onClick={submit} disabled={!canSubmit} loading={submitting}>
            Reportar defecto
          </Button>
        </>
      }
    >
        <Label>Título</Label>
        <Input
          autoFocus
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="Describe brevemente el defecto"
          className="mb-4"
        />

        <Label>Severidad</Label>
        <Select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
        >
          {severityOptions.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>

    </Modal>
  );
}
