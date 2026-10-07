"use client";

import { useEffect, useRef, useState } from "react";
import ConfirmModal from "./ConfirmModal";
import {
  Badge,
  Button,
  CodeBadge,
  EmptyState,
  IconButton,
  Input,
  Label,
  Modal,
  PriorityBadge,
  Select,
  Textarea,
  buttonClasses,
  cn,
  errorMessage,
  useToast,
} from "@/components/ui";
import {
  Bug,
  ChevronDown,
  Download,
  Eye,
  FileText,
  ImagePlus,
  Layers,
  Link2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";

type CaseRef = { id: string; code: string | null; title: string };
type RetestEntry = { id: string; date: string; result: string; comment: string };
type Attachment = { id: string; filename: string; url: string; retestId: string | null };
type Defect = {
  id: string;
  title: string;
  description: string | null;
  stepsToReproduce: string;
  module: string | null;
  environment: string | null;
  detectedAt: string | null;
  cases: CaseRef[];
  severity: string;
  status: string;
  retests: string;
  createdAt: string;
  attachments: Attachment[];
};

const statusColors: Record<string, string> = {
  open: "bg-red-50 text-red-700 ring-red-600/15",
  in_progress: "bg-amber-50 text-amber-700 ring-amber-600/20",
  closed: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
};

const statusTones = { open: "danger", in_progress: "warning", closed: "success" } as const;

const statusLabels: Record<string, string> = {
  open: "Abierto",
  in_progress: "En progreso",
  closed: "Cerrado",
};

const retestResultTones = { pending: "warning", passed: "success", failed: "danger" } as const;

const retestResultLabels: Record<string, string> = {
  pending: "Pendiente",
  passed: "Aprobado",
  failed: "Fallido",
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

// Normalizes older records briefly saved as {step, expected} pairs.
function parseSteps(raw: string): string[] {
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  return parsed.map((s: string | { step: string }) => (typeof s === "string" ? s : s.step));
}

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

// Backfills an id for retest entries saved before this field existed, so
// evidence uploads always have something stable to key off.
function parseRetests(raw: string): RetestEntry[] {
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  return parsed.map((r: Partial<RetestEntry>) => ({
    id: r.id || newId(),
    date: r.date || "",
    result: r.result || "pending",
    comment: r.comment || "",
  }));
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
  const [viewingImage, setViewingImage] = useState<(Attachment & { defectId: string }) | null>(
    null
  );
  const [pendingAttachmentDelete, setPendingAttachmentDelete] = useState<
    (Attachment & { defectId: string }) | null
  >(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [steps, setSteps] = useState<string[]>([""]);
  const [caseIds, setCaseIds] = useState<string[]>([]);
  const [retests, setRetests] = useState<RetestEntry[]>([]);
  const [moduleField, setModuleField] = useState("");
  const [environment, setEnvironment] = useState("");
  const [detectedAt, setDetectedAt] = useState(todayStr());
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState("");
  const [reportDefectIds, setReportDefectIds] = useState<string[]>([]);
  const [reportPickerOpen, setReportPickerOpen] = useState(false);
  const reportPickerRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  // Close the report picker when clicking outside it.
  useEffect(() => {
    if (!reportPickerOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (!reportPickerRef.current?.contains(e.target as Node)) setReportPickerOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [reportPickerOpen]);

  function toggleReportDefect(id: string) {
    setReportDefectIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }
  const [downloading, setDownloading] = useState<"docx" | "pdf" | null>(null);

  function openNew() {
    setEditingDefect(null);
    setTitle("");
    setDescription("");
    setSeverity("medium");
    setSteps([""]);
    setCaseIds([]);
    setRetests([]);
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
    const parsedSteps = parseSteps(d.stepsToReproduce);
    setSteps(parsedSteps.length ? parsedSteps : [""]);
    setCaseIds(d.cases.map((c) => c.id));
    setRetests(parseRetests(d.retests));
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

  function toggleCase(id: string) {
    setCaseIds((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  }

  function addRetest() {
    setRetests((r) => [...r, { id: newId(), date: todayStr(), result: "pending", comment: "" }]);
  }

  function updateRetest(idx: number, field: keyof RetestEntry, value: string) {
    setRetests((r) => r.map((entry, i) => (i === idx ? { ...entry, [field]: value } : entry)));
  }

  function removeRetest(idx: number) {
    setRetests((r) => r.filter((_, i) => i !== idx));
  }

  async function saveDefect(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      title,
      description,
      severity,
      stepsToReproduce: steps.map((s) => s.trim()).filter(Boolean),
      caseIds,
      module: moduleField || null,
      environment: environment || null,
      detectedAt: detectedAt || null,
      retests: retests.filter((r) => r.date || r.comment.trim()),
    };
    setSaving(true);
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
    setSaving(false);
    if (!res.ok) {
      toast.error(await errorMessage(res, "No se pudo guardar el defecto"));
      return;
    }
    const saved = await res.json();
    if (editingDefect) {
      setDefects((d) => d.map((x) => (x.id === saved.id ? { ...x, ...saved } : x)));
      if (viewingDefect?.id === saved.id) setViewingDefect((v) => (v ? { ...v, ...saved } : v));
    } else {
      setDefects((d) => [saved, ...d]);
    }
    setOpen(false);
    setEditingDefect(null);
    toast.success(editingDefect ? "Defecto actualizado" : "Defecto creado", saved.title);
  }

  async function updateStatus(id: string, status: string) {
    const previous = defects.find((x) => x.id === id)?.status;
    setDefects((d) => d.map((x) => (x.id === id ? { ...x, status } : x)));
    const res = await fetch(`/api/defects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => null);
    if (res?.ok) {
      toast.success(`Defecto ${statusLabels[status]?.toLowerCase() ?? "actualizado"}`);
    } else {
      if (previous) setDefects((d) => d.map((x) => (x.id === id ? { ...x, status: previous } : x)));
      toast.error("No se pudo cambiar el estado del defecto");
    }
  }

  async function remove(id: string) {
    setPendingDelete(null);
    const res = await fetch(`/api/defects/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(await errorMessage(res, "No se pudo eliminar el defecto"));
      return;
    }
    setDefects((d) => d.filter((x) => x.id !== id));
    setReportDefectIds((ids) => ids.filter((x) => x !== id));
    toast.success("Defecto eliminado");
  }

  async function uploadEvidence(defectId: string, file: File, retestId?: string) {
    const fd = new FormData();
    fd.append("file", file);
    if (retestId) fd.append("retestId", retestId);
    const res = await fetch(`/api/defects/${defectId}/attachments`, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      toast.error(await errorMessage(res, "No se pudo subir la evidencia"), file.name);
      return;
    }
    const attachment: Attachment = await res.json();
    toast.success("Evidencia subida", file.name);
    setDefects((d) =>
      d.map((x) =>
        x.id === defectId ? { ...x, attachments: [...x.attachments, attachment] } : x
      )
    );
    setViewingDefect((v) =>
      v && v.id === defectId ? { ...v, attachments: [...v.attachments, attachment] } : v
    );
  }

  async function removeAttachment(defectId: string, attachmentId: string) {
    setPendingAttachmentDelete(null);
    const res = await fetch(`/api/attachments/${attachmentId}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(await errorMessage(res, "No se pudo eliminar la evidencia"));
      return;
    }
    toast.success("Evidencia eliminada");
    const strip = (x: Defect) =>
      x.id === defectId
        ? { ...x, attachments: x.attachments.filter((a) => a.id !== attachmentId) }
        : x;
    setDefects((d) => d.map(strip));
    setViewingDefect((v) => (v ? strip(v) : v));
    setViewingImage((img) => (img?.id === attachmentId ? null : img));
  }

  // Thumbnail that opens the viewer, with a hover ✕ to delete the evidence.
  function evidenceThumb(defectId: string, a: Attachment, sizeClass: string) {
    return (
      <div key={a.id} className={`relative group shrink-0 ${sizeClass}`}>
        <button
          type="button"
          onClick={() => setViewingImage({ ...a, defectId })}
          className="block w-full h-full rounded-lg border border-slate-200 overflow-hidden"
        >
          <img src={a.url} alt={a.filename} className="w-full h-full object-cover" />
        </button>
        <button
          type="button"
          title="Eliminar evidencia"
          onClick={() => setPendingAttachmentDelete({ ...a, defectId })}
          aria-label="Eliminar evidencia"
          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-slate-200 text-slate-500 shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
        >
          <X size={11} aria-hidden />
        </button>
      </div>
    );
  }

  async function downloadReport(format: "docx" | "pdf") {
    setDownloading(format);
    try {
      const base = `/api/projects/${projectId}/reports/defects`;
      const filterParam = reportDefectIds.length
        ? reportDefectIds.map((id) => `&defectId=${encodeURIComponent(id)}`).join("")
        : dateFilter
        ? `&date=${dateFilter}`
        : "";
      const url = `${base}?format=${format}${filterParam}`;
      const res = await fetch(url);
      if (!res.ok) {
        toast.error("No se pudo generar el reporte de defectos");
        return;
      }
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
            <Input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-auto h-8 text-slate-600"
              aria-label="Filtrar por fecha"
            />
            {dateFilter && (
              <IconButton icon={X} label="Quitar filtro de fecha" onClick={() => setDateFilter("")} />
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div ref={reportPickerRef} className="relative">
            <button
              type="button"
              onClick={() => setReportPickerOpen((o) => !o)}
              title="Alcance del reporte de defectos"
              className="flex items-center gap-2 h-8 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 shadow-sm hover:bg-slate-50 max-w-[240px]"
            >
              <FileText size={14} className="text-slate-400 shrink-0" aria-hidden />
              <span className="truncate">
                {reportDefectIds.length === 0
                  ? "Todos los defectos"
                  : reportDefectIds.length === 1
                  ? defects.find((d) => d.id === reportDefectIds[0])?.title ?? "1 defecto"
                  : `${reportDefectIds.length} defectos seleccionados`}
              </span>
              <ChevronDown size={14} className="text-slate-400 shrink-0" aria-hidden />
            </button>
            {reportPickerOpen && (
              <div className="absolute right-0 z-20 mt-1 w-[min(32rem,90vw)] max-h-80 overflow-y-auto rounded-xl bg-white py-1 shadow-lg ring-1 ring-slate-900/10">
                <button
                  type="button"
                  onClick={() => setReportDefectIds([])}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-50 ${
                    reportDefectIds.length === 0 ? "font-medium text-brand-700" : "text-slate-700"
                  }`}
                >
                  <input type="checkbox" readOnly checked={reportDefectIds.length === 0} className="accent-brand-600" />
                  Todos los defectos
                </button>
                <div className="my-1 border-t border-slate-100" />
                {defects.map((d) => (
                  <label
                    key={d.id}
                    className="flex cursor-pointer items-start gap-2 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={reportDefectIds.includes(d.id)}
                      onChange={() => toggleReportDefect(d.id)}
                      className="mt-0.5 accent-brand-600"
                    />
                    <span>{d.title}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={Download}
            onClick={() => downloadReport("docx")}
            disabled={downloading !== null && downloading !== "docx"}
            loading={downloading === "docx"}
          >
            Word
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={Download}
            onClick={() => downloadReport("pdf")}
            disabled={downloading !== null && downloading !== "pdf"}
            loading={downloading === "pdf"}
          >
            PDF
          </Button>
          <Button icon={Plus}
            size="sm"
            onClick={openNew}
          >
            Nuevo defecto
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {filteredDefects.map((d) => (
          <div key={d.id} className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex gap-3 min-w-0">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
                  <Bug size={16} aria-hidden />
                </span>
                <div className="min-w-0">
                <button
                  onClick={() => openViewDefect(d)}
                  className="font-medium text-slate-900 text-sm text-left hover:text-brand-700"
                >
                  {d.title}
                </button>
                {d.description && (
                  <p className="text-sm text-slate-500 mt-1">{d.description}</p>
                )}
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  <PriorityBadge priority={d.severity} />
                  {d.module && <Badge icon={Layers}>{d.module}</Badge>}
                  {d.cases.map((c) => (
                    <Badge key={c.id} icon={Link2} className="max-w-full truncate" title={c.title}>
                      {c.code ?? c.title}
                    </Badge>
                  ))}
                </div>
                <div className="mt-3">
                  <p className="text-xs text-slate-400 mb-1.5">Evidencia</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {d.attachments
                      .filter((a) => !a.retestId)
                      .map((a) => evidenceThumb(d.id, a, "w-14 h-14"))}
                    <label
                      title="Subir evidencia"
                      className="flex items-center justify-center w-14 h-14 rounded-lg border-2 border-dashed border-slate-300 text-slate-400 cursor-pointer hover:border-brand-400 hover:text-brand-600 shrink-0"
                    >
                      <ImagePlus size={18} aria-hidden />
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
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <select
                  value={d.status}
                  onChange={(e) => updateStatus(d.id, e.target.value)}
                  aria-label="Estado del defecto"
                  className={cn(
                    "text-xs font-medium rounded-md px-2 h-7 border-0 ring-1 ring-inset cursor-pointer mr-1",
                    statusColors[d.status]
                  )}
                >
                  <option value="open">Abierto</option>
                  <option value="in_progress">En progreso</option>
                  <option value="closed">Cerrado</option>
                </select>
                <IconButton icon={Eye} label="Ver defecto" onClick={() => openViewDefect(d)} />
                <IconButton icon={Pencil} label="Editar defecto" onClick={() => openEditDefect(d)} />
                <IconButton
                  icon={Trash2}
                  label="Eliminar defecto"
                  tone="danger"
                  onClick={() => setPendingDelete(d.id)}
                />
              </div>
            </div>
          </div>
        ))}
        {filteredDefects.length === 0 && (
          defects.length === 0 ? (
            <EmptyState
              icon={Bug}
              title="No hay defectos reportados"
              description="También puedes crearlos directamente desde un test run al marcar un caso como Failed."
              action={
                <Button icon={Plus} size="sm" onClick={openNew}>
                  Nuevo defecto
                </Button>
              }
            />
          ) : (
            <EmptyState title="No hay defectos que coincidan con este filtro" />
          )
        )}
      </div>

      {open && (
        <Modal
          onClose={() => {
            setOpen(false);
            setEditingDefect(null);
          }}
          title={editingDefect ? "Editar defecto" : "Nuevo defecto"}
        >
            <form onSubmit={saveDefect} className="space-y-4">
              <div>
                <Label>Título</Label>
                <Input
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
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

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="mb-0">Pasos a reproducir</Label>
                  <Button variant="soft" size="xs" icon={Plus} onClick={addStep}>
                    Agregar paso
                  </Button>
                </div>
                <div className="space-y-2">
                  {steps.map((s, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <span className="text-xs text-slate-400 mt-2 w-4">{i + 1}.</span>
                      <Textarea
                        placeholder="Descripción"
                        value={s}
                        onChange={(e) => updateStep(i, e.target.value)}
                        rows={1}
                        className="flex-1"
                      />
                      <IconButton
                        icon={X}
                        label="Quitar paso"
                        tone="danger"
                        onClick={() => removeStep(i)}
                        className="mt-0.5"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Severidad</Label>
                  <Select
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value)}
                  >
                    <option value="low">Baja</option>
                    <option value="medium">Media</option>
                    <option value="high">Alta</option>
                    <option value="critical">Crítica</option>
                  </Select>
                </div>
                <div>
                  <Label>Fecha de detección</Label>
                  <Input
                    type="date"
                    value={detectedAt}
                    onChange={(e) => setDetectedAt(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Módulo / Sección</Label>
                  <Input
                    value={moduleField}
                    onChange={(e) => setModuleField(e.target.value)}
                    placeholder="Ej. Cobros Judiciales → Tramitados"
                  />
                </div>
                <div>
                  <Label>Ambiente</Label>
                  <Input
                    value={environment}
                    onChange={(e) => setEnvironment(e.target.value)}
                    placeholder="Ej. URL de pruebas"
                  />
                </div>
              </div>

              <div>
                <Label>
                  Casos de prueba relacionados
                </Label>
                {cases.length ? (
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-300 p-2 grid grid-cols-1 sm:grid-cols-2 gap-x-3">
                    {cases.map((c) => (
                      <label
                        key={c.id}
                        className="flex items-center gap-2 px-1 py-1 text-sm text-slate-700 hover:bg-slate-50 rounded cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={caseIds.includes(c.id)}
                          onChange={() => toggleCase(c.id)}
                          className="rounded border-slate-300 shrink-0"
                        />
                        <CodeBadge code={c.code} />
                        <span className="truncate" title={c.title}>
                          {c.title}
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">No hay casos de prueba en este proyecto.</p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="mb-0">Re-test</Label>
                  <Button variant="soft" size="xs" icon={Plus} onClick={addRetest}>
                    Agregar re-test
                  </Button>
                </div>
                <div className="space-y-2">
                  {retests.map((r, i) => (
                    <div key={i} className="rounded-lg border border-slate-200 p-2.5 space-y-2">
                      <div className="flex gap-2 items-center">
                        <Input
                          type="date"
                          value={r.date}
                          onChange={(e) => updateRetest(i, "date", e.target.value)}
                          className="flex-1 h-8"
                        />
                        <Select
                          value={r.result}
                          onChange={(e) => updateRetest(i, "result", e.target.value)}
                          className="w-auto h-8"
                        >
                          <option value="pending">Pendiente</option>
                          <option value="passed">Aprobado</option>
                          <option value="failed">Fallido</option>
                        </Select>
                        <IconButton
                          icon={X}
                          label="Quitar re-test"
                          tone="danger"
                          onClick={() => removeRetest(i)}
                        />
                      </div>
                      <Textarea
                        placeholder="Comentario del re-test"
                        value={r.comment}
                        onChange={(e) => updateRetest(i, "comment", e.target.value)}
                        rows={1}
                      />
                    </div>
                  ))}
                  {retests.length === 0 && (
                    <p className="text-xs text-slate-400">Sin re-tests registrados.</p>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setEditingDefect(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button type="submit" loading={saving}>
                  {editingDefect ? "Guardar" : "Crear"}
                </Button>
              </div>
            </form>
        </Modal>
      )}

      {viewingDefect && (
        <Modal
          onClose={() => setViewingDefect(null)}
          size="lg"
          title={
            <span className="flex items-center gap-2">
              <Bug size={18} className="text-red-600 shrink-0" aria-hidden />
              {viewingDefect.title}
            </span>
          }
          footer={
            <>
              <Button variant="secondary" onClick={() => setViewingDefect(null)}>
                Cerrar
              </Button>
              <Button
                icon={Pencil}
                onClick={() => {
                  const d = viewingDefect;
                  setViewingDefect(null);
                  openEditDefect(d);
                }}
              >
                Editar
              </Button>
            </>
          }
        >
            <div className="flex gap-1.5 mb-5">
              <Badge tone={statusTones[viewingDefect.status as keyof typeof statusTones] ?? "neutral"}>
                {statusLabels[viewingDefect.status] || viewingDefect.status}
              </Badge>
              <PriorityBadge priority={viewingDefect.severity} />
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
              const parsedSteps = parseSteps(viewingDefect.stepsToReproduce);
              return (
                parsedSteps.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-sm font-medium text-slate-700 mb-2">
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

            {viewingDefect.cases.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-slate-700 mb-1">
                  Casos de prueba relacionados
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {viewingDefect.cases.map((c) => (
                    <Badge key={c.id} icon={Link2}>
                      {c.code ? `${c.code} · ${c.title}` : c.title}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {(() => {
              const parsedRetests = parseRetests(viewingDefect.retests);
              return (
                parsedRetests.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-sm font-medium text-slate-700 mb-2">Re-test</h3>
                    <div className="space-y-2">
                      {parsedRetests.map((r) => (
                        <div key={r.id} className="rounded-lg border border-slate-100 p-2 text-sm space-y-2">
                          <div className="flex items-start gap-3">
                            <span className="text-slate-500 shrink-0">{r.date || "—"}</span>
                            <Badge
                              tone={retestResultTones[r.result as keyof typeof retestResultTones] ?? "neutral"}
                              className="shrink-0"
                            >
                              {retestResultLabels[r.result] || r.result}
                            </Badge>
                            {r.comment && (
                              <p className="text-slate-600 whitespace-pre-wrap">{r.comment}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            {viewingDefect.attachments
                              .filter((a) => a.retestId === r.id)
                              .map((a) => evidenceThumb(viewingDefect.id, a, "w-12 h-12"))}
                            <label
                              title="Subir evidencia del re-test"
                              className="flex items-center justify-center w-12 h-12 rounded border-2 border-dashed border-slate-300 text-slate-400 cursor-pointer hover:border-brand-400 hover:text-brand-600 shrink-0"
                            >
                              <ImagePlus size={16} aria-hidden />
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) uploadEvidence(viewingDefect.id, file, r.id);
                                  e.target.value = "";
                                }}
                              />
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              );
            })()}

            {viewingDefect.attachments.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-slate-700 mb-2">Evidencia</h3>
                <div className="flex items-center gap-2 flex-wrap">
                  {viewingDefect.attachments.map((a) =>
                    evidenceThumb(viewingDefect.id, a, "w-16 h-16")
                  )}
                </div>
              </div>
            )}

        </Modal>
      )}

      {viewingImage && (
        <div
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
          onClick={() => setViewingImage(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl ring-1 ring-slate-900/5 max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 p-3 border-b border-slate-100">
              <span className="text-sm text-slate-700 truncate">{viewingImage.filename}</span>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={viewingImage.url}
                  download={viewingImage.filename}
                  className={buttonClasses({ variant: "soft", size: "xs" })}
                >
                  <Download size={14} aria-hidden />
                  Descargar
                </a>
                <Button
                  variant="ghost"
                  size="xs"
                  icon={Trash2}
                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => setPendingAttachmentDelete(viewingImage)}
                >
                  Eliminar
                </Button>
                <IconButton icon={X} label="Cerrar" onClick={() => setViewingImage(null)} />
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

      <ConfirmModal
        open={pendingAttachmentDelete !== null}
        title="¿Eliminar evidencia?"
        message={`Se borrará "${pendingAttachmentDelete?.filename ?? ""}". Esta acción no se puede deshacer.`}
        onConfirm={() =>
          pendingAttachmentDelete &&
          removeAttachment(pendingAttachmentDelete.defectId, pendingAttachmentDelete.id)
        }
        onCancel={() => setPendingAttachmentDelete(null)}
      />
    </div>
  );
}
