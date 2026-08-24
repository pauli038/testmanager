"use client";

import { useState } from "react";
import ConfirmModal from "./ConfirmModal";

type CaseRef = { id: string; title: string };
type Defect = {
  id: string;
  title: string;
  description: string | null;
  stepsToReproduce: string;
  module: string | null;
  environment: string | null;
  detectedAt: string | null;
  caseId: string | null;
  case: CaseRef | null;
  severity: string;
  status: string;
  createdAt: string;
  attachments: { id: string; filename: string; url: string }[];
};

const severityColors: Record<string, string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const statusColors: Record<string, string> = {
  open: "bg-red-100 text-red-700",
  in_progress: "bg-amber-100 text-amber-700",
  closed: "bg-emerald-100 text-emerald-700",
};

const statusLabels: Record<string, string> = {
  open: "Abierto",
  in_progress: "En progreso",
  closed: "Cerrado",
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function toLocalDateStr(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function DefectsList({
  projectId,
  initialDefects,
  cases,
}: {
  projectId: string;
  initialDefects: Defect[];
  cases: CaseRef[];
}) {
  const [defects, setDefects] = useState(initialDefects);
  const [open, setOpen] = useState(false);
  const [editingDefect, setEditingDefect] = useState<Defect | null>(null);
  const [viewingDefect, setViewingDefect] = useState<Defect | null>(null);
  const [viewingImage, setViewingImage] = useState<{ filename: string; url: string } | null>(
    null
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [steps, setSteps] = useState<string[]>([""]);
  const [caseId, setCaseId] = useState("");
  const [moduleField, setModuleField] = useState("");
  const [environment, setEnvironment] = useState("");
  const [detectedAt, setDetectedAt] = useState(todayStr());
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState("");
  const [downloading, setDownloading] = useState<"docx" | "pdf" | null>(null);

  function openNew() {
    setEditingDefect(null);
    setTitle("");
    setDescription("");
    setSeverity("medium");
    setSteps([""]);
    setCaseId("");
    setModuleField("");
    setEnvironment("");
    setDetectedAt(todayStr());
    setOpen(true);
  }

  function openEditDefect(d: Defect) {
    setEditingDefect(d);
    setTitle(d.title);
    setDescription(d.description || "");
    setSeverity(d.severity);
    const parsedSteps: string[] = d.stepsToReproduce ? JSON.parse(d.stepsToReproduce) : [];
    setSteps(parsedSteps.length ? parsedSteps : [""]);
    setCaseId(d.caseId || "");
    setModuleField(d.module || "");
    setEnvironment(d.environment || "");
    setDetectedAt(d.detectedAt || todayStr());
    setOpen(true);
  }

  function openViewDefect(d: Defect) {
    setViewingDefect(d);
  }

  function updateStep(idx: number, value: string) {
    setSteps((s) => s.map((st, i) => (i === idx ? value : st)));
  }

  function addStep() {
    setSteps((s) => [...s, ""]);
  }

  function removeStep(idx: number) {
    setSteps((s) => s.filter((_, i) => i !== idx));
  }

  async function saveDefect(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      title,
      description,
      severity,
      stepsToReproduce: steps.map((s) => s.trim()).filter(Boolean),
      caseId: caseId || null,
      module: moduleField || null,
      environment: environment || null,
      detectedAt: detectedAt || null,
    };
    const res = editingDefect
      ? await fetch(`/api/defects/${editingDefect.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, status: editingDefect.status }),
        })
      : await fetch(`/api/projects/${projectId}/defects`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
    if (res.ok) {
      const saved = await res.json();
      if (editingDefect) {
        setDefects((d) => d.map((x) => (x.id === saved.id ? { ...x, ...saved } : x)));
        if (viewingDefect?.id === saved.id) setViewingDefect((v) => (v ? { ...v, ...saved } : v));
      } else {
        setDefects((d) => [saved, ...d]);
      }
      setOpen(false);
      setEditingDefect(null);
    }
  }

  async function updateStatus(id: string, status: string) {
    setDefects((d) => d.map((x) => (x.id === id ? { ...x, status } : x)));
    await fetch(`/api/defects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }

  async function remove(id: string) {
    await fetch(`/api/defects/${id}`, { method: "DELETE" });
    setDefects((d) => d.filter((x) => x.id !== id));
    setPendingDelete(null);
  }

  async function uploadEvidence(defectId: string, file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/defects/${defectId}/attachments`, {
      method: "POST",
      body: fd,
    });
    if (res.ok) {
      const attachment = await res.json();
      setDefects((d) =>
        d.map((x) =>
          x.id === defectId ? { ...x, attachments: [...x.attachments, attachment] } : x
        )
      );
    }
  }

  async function downloadReport(format: "docx" | "pdf") {
    setDownloading(format);
    try {
      const base = `/api/projects/${projectId}/reports/defects`;
      const url = `${base}?format=${format}${dateFilter ? `&date=${dateFilter}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="(.+?)"/);
      const filename = match?.[1] || `reporte-defectos.${format}`;
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(objectUrl);
    } finally {
      setDownloading(null);
    }
  }

  const filteredDefects = defects.filter((d) => {
    if (!dateFilter) return true;
    const day = d.detectedAt || toLocalDateStr(d.createdAt);
    return day === dateFilter;
  });

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="text-sm font-medium text-slate-700">Defectos / Bugs</h3>
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600"
            />
            {dateFilter && (
              <button
                onClick={() => setDateFilter("")}
                className="text-xs text-slate-400 hover:text-red-600"
                title="Quitar filtro de fecha"
              >
                ✕
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => downloadReport("docx")}
            disabled={downloading !== null}
            className="text-xs font-medium rounded-lg px-2.5 py-1.5 bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {downloading === "docx" ? "Generando..." : "📄 Reporte Word"}
          </button>
          <button
            onClick={() => downloadReport("pdf")}
            disabled={downloading !== null}
            className="text-xs font-medium rounded-lg px-2.5 py-1.5 bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {downloading === "pdf" ? "Generando..." : "📄 Reporte PDF"}
          </button>
          <button
            onClick={openNew}
            className="rounded-lg bg-teal-600 text-white text-sm font-medium px-3 py-1.5 hover:bg-teal-700"
          >
            + Nuevo defecto
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {filteredDefects.map((d) => (
          <div key={d.id} className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-medium text-slate-900 text-sm">🐞 {d.title}</h4>
                {d.description && (
                  <p className="text-sm text-slate-500 mt-1">{d.description}</p>
                )}
                <div className="flex gap-2 mt-2 flex-wrap">
                  <span className={`text-xs rounded px-1.5 py-0.5 ${severityColors[d.severity]}`}>
                    {d.severity}
                  </span>
                  {d.module && (
                    <span className="text-xs bg-slate-50 border border-slate-200 text-slate-500 rounded px-1.5 py-0.5">
                      🧩 {d.module}
                    </span>
                  )}
                  {d.case && (
                    <span className="text-xs bg-slate-50 border border-slate-200 text-slate-500 rounded px-1.5 py-0.5">
                      🔗 {d.case.title}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap mt-2">
                  {d.attachments.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setViewingImage(a)}
                      className="block w-12 h-12 rounded border border-slate-200 overflow-hidden"
                    >
                      <img src={a.url} alt={a.filename} className="w-full h-full object-cover" />
                    </button>
                  ))}
                  <label className="text-xs text-teal-600 cursor-pointer hover:underline">
                    📸 Subir evidencia
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadEvidence(d.id, file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={d.status}
                  onChange={(e) => updateStatus(d.id, e.target.value)}
                  className={`text-xs rounded px-2 py-1 border-0 ${statusColors[d.status]}`}
                >
                  <option value="open">Abierto</option>
                  <option value="in_progress">En progreso</option>
                  <option value="closed">Cerrado</option>
                </select>
                <button
                  onClick={() => openViewDefect(d)}
                  className="text-xs font-medium rounded-lg px-2.5 py-1 bg-slate-100 text-slate-600 hover:bg-slate-200"
                >
                  Ver
                </button>
                <button
                  onClick={() => openEditDefect(d)}
                  className="text-xs font-medium rounded-lg px-2.5 py-1 bg-teal-50 text-teal-700 hover:bg-teal-100"
                >
                  Editar
                </button>
                <button
                  onClick={() => setPendingDelete(d.id)}
                  className="text-xs font-medium rounded-lg px-2 py-1 bg-slate-100 text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        ))}
        {filteredDefects.length === 0 && (
          <p className="text-sm text-slate-400 py-10 text-center border border-dashed border-slate-300 rounded-xl">
            {defects.length === 0
              ? "No hay defectos reportados. También puedes crearlos directamente desde un test run al marcar un caso como Failed."
              : "No hay defectos que coincidan con este filtro."}
          </p>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              {editingDefect ? "Editar defecto" : "Nuevo defecto"}
            </h2>
            <form onSubmit={saveDefect} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-700 mb-1">Título</label>
                <input
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-700 mb-1">Descripción</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm text-slate-700">Pasos a reproducir</label>
                  <button
                    type="button"
                    onClick={addStep}
                    className="text-xs text-teal-600 hover:underline"
                  >
                    + agregar paso
                  </button>
                </div>
                <div className="space-y-2">
                  {steps.map((s, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <span className="text-xs text-slate-400 mt-2 w-4">{i + 1}.</span>
                      <textarea
                        placeholder={`Paso ${i + 1}`}
                        value={s}
                        onChange={(e) => updateStep(i, e.target.value)}
                        rows={1}
                        className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => removeStep(i)}
                        className="text-slate-400 hover:text-red-600 mt-1.5"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate-700 mb-1">Severidad</label>
                  <select
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
                  >
                    <option value="low">Baja</option>
                    <option value="medium">Media</option>
                    <option value="high">Alta</option>
                    <option value="critical">Crítica</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-700 mb-1">Fecha de detección</label>
                  <input
                    type="date"
                    value={detectedAt}
                    onChange={(e) => setDetectedAt(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate-700 mb-1">Módulo / Sección</label>
                  <input
                    value={moduleField}
                    onChange={(e) => setModuleField(e.target.value)}
                    placeholder="Ej. Cobros Judiciales → Tramitados"
                    className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-700 mb-1">Ambiente</label>
                  <input
                    value={environment}
                    onChange={(e) => setEnvironment(e.target.value)}
                    placeholder="Ej. URL de pruebas"
                    className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-slate-700 mb-1">
                  Caso de prueba relacionado
                </label>
                <select
                  value={caseId}
                  onChange={(e) => setCaseId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
                >
                  <option value="">— Ninguno —</option>
                  {cases.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setEditingDefect(null);
                  }}
                  className="text-sm text-slate-600 px-4 py-2"
                >
                  Cancelar
                </button>
                <button className="rounded-lg bg-teal-600 text-white text-sm font-medium px-4 py-2 hover:bg-teal-700">
                  {editingDefect ? "Guardar" : "Crear"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewingDefect && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">🐞 {viewingDefect.title}</h2>
              <span
                className={`text-xs rounded px-1.5 py-0.5 whitespace-nowrap ml-2 ${statusColors[viewingDefect.status]}`}
              >
                {statusLabels[viewingDefect.status] || viewingDefect.status}
              </span>
            </div>

            <div className="flex gap-2 mb-4">
              <span
                className={`text-xs rounded px-1.5 py-0.5 ${severityColors[viewingDefect.severity]}`}
              >
                {viewingDefect.severity}
              </span>
            </div>

            {viewingDefect.description && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-slate-700 mb-1">Descripción</h3>
                <p className="text-sm text-slate-600 whitespace-pre-wrap">
                  {viewingDefect.description}
                </p>
              </div>
            )}

            {(() => {
              const parsedSteps: string[] = viewingDefect.stepsToReproduce
                ? JSON.parse(viewingDefect.stepsToReproduce)
                : [];
              return (
                parsedSteps.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-sm font-medium text-slate-700 mb-1">
                      Pasos a reproducir
                    </h3>
                    <ol className="list-decimal list-inside space-y-1">
                      {parsedSteps.map((s, i) => (
                        <li key={i} className="text-sm text-slate-600">
                          {s}
                        </li>
                      ))}
                    </ol>
                  </div>
                )
              );
            })()}

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <h3 className="text-sm font-medium text-slate-700 mb-1">Fecha de detección</h3>
                <p className="text-sm text-slate-600">{viewingDefect.detectedAt || "—"}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-slate-700 mb-1">Creado</h3>
                <p className="text-sm text-slate-600">
                  {new Date(viewingDefect.createdAt).toLocaleString()}
                </p>
              </div>
            </div>

            {(viewingDefect.module || viewingDefect.environment) && (
              <div className="grid grid-cols-2 gap-4 mb-4">
                {viewingDefect.module && (
                  <div>
                    <h3 className="text-sm font-medium text-slate-700 mb-1">Módulo / Sección</h3>
                    <p className="text-sm text-slate-600">{viewingDefect.module}</p>
                  </div>
                )}
                {viewingDefect.environment && (
                  <div>
                    <h3 className="text-sm font-medium text-slate-700 mb-1">Ambiente</h3>
                    <p className="text-sm text-slate-600 break-all">
                      {viewingDefect.environment}
                    </p>
                  </div>
                )}
              </div>
            )}

            {viewingDefect.case && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-slate-700 mb-1">
                  Caso de prueba relacionado
                </h3>
                <p className="text-sm text-slate-600">🔗 {viewingDefect.case.title}</p>
              </div>
            )}

            {viewingDefect.attachments.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-slate-700 mb-2">Evidencia</h3>
                <div className="flex items-center gap-2 flex-wrap">
                  {viewingDefect.attachments.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setViewingImage(a)}
                      className="block w-16 h-16 rounded border border-slate-200 overflow-hidden"
                    >
                      <img src={a.url} alt={a.filename} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setViewingDefect(null)}
                className="text-sm text-slate-600 px-4 py-2 hover:text-slate-900"
              >
                Cerrar
              </button>
              <button
                onClick={() => {
                  const d = viewingDefect;
                  setViewingDefect(null);
                  openEditDefect(d);
                }}
                className="rounded-lg bg-teal-600 text-white text-sm font-medium px-4 py-2 hover:bg-teal-700"
              >
                Editar
              </button>
            </div>
          </div>
        </div>
      )}

      {viewingImage && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4"
          onClick={() => setViewingImage(null)}
        >
          <div
            className="bg-white rounded-xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 p-3 border-b border-slate-100">
              <span className="text-sm text-slate-700 truncate">{viewingImage.filename}</span>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={viewingImage.url}
                  download={viewingImage.filename}
                  className="text-xs font-medium rounded-lg px-2.5 py-1 bg-teal-50 text-teal-700 hover:bg-teal-100"
                >
                  ⬇ Descargar
                </a>
                <button
                  onClick={() => setViewingImage(null)}
                  className="text-xs font-medium rounded-lg px-2 py-1 bg-slate-100 text-slate-500 hover:bg-slate-200"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="overflow-auto p-4 flex items-center justify-center bg-slate-50">
              <img
                src={viewingImage.url}
                alt={viewingImage.filename}
                className="max-w-full max-h-[70vh] object-contain"
              />
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={pendingDelete !== null}
        message="¿Eliminar este defecto?"
        onConfirm={() => pendingDelete && remove(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
