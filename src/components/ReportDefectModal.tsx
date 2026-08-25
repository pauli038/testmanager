"use client";

import { useEffect, useState } from "react";

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

  if (!open) return null;

  const canSubmit = title.trim().length > 0 && !submitting;

  function submit() {
    if (!canSubmit) return;
    onConfirm(title.trim(), severity);
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-1">🐞 Reportar defecto</h2>
        <p className="text-sm text-slate-500 mb-4">
          Para el caso <span className="font-medium text-slate-700">&quot;{caseTitle}&quot;</span>
        </p>

        <label className="block text-xs font-medium text-slate-500 mb-1">Título</label>
        <input
          autoFocus
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") onCancel();
          }}
          placeholder="Describe brevemente el defecto"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-teal-500"
        />

        <label className="block text-xs font-medium text-slate-500 mb-1">Severidad</label>
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-6"
        >
          {severityOptions.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-sm text-slate-600 px-4 py-2 hover:text-slate-900"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="rounded-lg text-white text-sm font-medium px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50"
          >
            {submitting ? "Reportando..." : "Reportar defecto"}
          </button>
        </div>
      </div>
    </div>
  );
}
