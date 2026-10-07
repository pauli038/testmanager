"use client";

import { useEffect, useState } from "react";
import ConfirmModal from "./ConfirmModal";
import ReportDefectModal from "./ReportDefectModal";
import { stripAnsi } from "@/lib/ansi";
import {
  AutomatedBadge,
  Badge,
  Button,
  CodeBadge,
  EmptyState,
  StatusBadge,
  STATUS_META,
  Textarea,
  cn,
  errorMessage,
  useToast,
  type RunStatus,
} from "@/components/ui";
import {
  Bug,
  ChevronRight,
  ExternalLink,
  FileArchive,
  GitBranch,
  GitCommitHorizontal,
  ImagePlus,
  Loader2,
  ListChecks,
  Play,
  X,
} from "lucide-react";

const MAX_VIDEO_SECONDS = 200;
// Above this size, upload in chunks instead of one request — some proxies
// (e.g. VS Code Dev Tunnels) reject large single-request bodies with a 413.
const CHUNK_THRESHOLD_BYTES = 4 * 1024 * 1024; // 4MB
const CHUNK_SIZE_BYTES = 2 * 1024 * 1024; // 2MB

function toLocalDateStr(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error("No se pudo leer el video"));
    };
    video.src = URL.createObjectURL(file);
  });
}

type Step = { step: string; expected: string };
type RunCase = {
  id: string;
  status: "untested" | "passed" | "failed" | "blocked" | "skipped";
  comment: string | null;
  executedAt: string | null;
  durationMs: number | null;
  errorMessage: string | null;
  executedByName: string | null;
  caseId: string;
  caseCode: string | null;
  caseTitle: string;
  caseSteps: string;
  casePreconditions: string | null;
  casePriority: string;
  caseAutomated: boolean;
  attachments: { id: string; url: string; filename: string; mimeType: string }[];
  defects: { id: string; title: string; status: string }[];
};

const STATUS_ORDER: RunStatus[] = ["passed", "failed", "blocked", "skipped", "untested"];

// Background of each status in the run's progress bar and of the result
// buttons once selected (same palette as the dashboard).
const STATUS_FILL: Record<RunStatus, string> = {
  passed: "bg-emerald-500",
  failed: "bg-red-500",
  blocked: "bg-amber-500",
  skipped: "bg-cyan-500",
  untested: "bg-slate-200",
};

export default function RunExecution({
  projectId,
  runId,
}: {
  projectId: string;
  runId: string;
}) {
  const [run, setRun] = useState<{
    id: string;
    name: string;
    source: string;
    ciUrl: string | null;
    branch: string | null;
    commitSha: string | null;
  } | null>(null);
  const [runCases, setRunCases] = useState<RunCase[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<{ runCaseId: string; message: string } | null>(
    null
  );
  const [pendingDeleteAttachment, setPendingDeleteAttachment] = useState<{
    runCaseId: string;
    attachmentId: string;
  } | null>(null);
  const [pendingDefect, setPendingDefect] = useState<{
    runCaseId: string;
    caseTitle: string;
  } | null>(null);
  const [reportingDefect, setReportingDefect] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;

    function load(showSpinner: boolean) {
      if (showSpinner) setLoading(true);
      fetch(`/api/runs/${runId}`)
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((data) => {
          if (cancelled) return;
          setRun(data.run);
          setRunCases(data.runCases);
          setLoading(false);
          setLoadError(null);
        })
        .catch((err) => {
          if (cancelled) return;
          console.error("Error cargando la ejecución:", err);
          setLoading(false);
          setLoadError("No se pudo cargar la ejecución. Intenta recargar la página.");
        });
    }

    load(true);
    // Auto-refresh so results entered by other testers on this same run show
    // up without needing a manual page reload.
    const interval = setInterval(() => load(false), 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [runId]);

  async function setStatus(runCaseId: string, status: RunCase["status"]) {
    // Preserve a previously set/edited execution date instead of always
    // restamping "now" — only defaults to now the first time a case is executed.
    const previous = runCases.find((c) => c.id === runCaseId);
    const executedAt = previous?.executedAt ?? new Date().toISOString();
    setRunCases((rc) => rc.map((c) => (c.id === runCaseId ? { ...c, status, executedAt } : c)));
    const res = await fetch(`/api/run-cases/${runCaseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, executedAt }),
    }).catch(() => null);
    // No toast on success: results are marked one after another and the
    // button already shows the new status. Only a failure needs attention.
    if (!res?.ok) {
      if (previous) setRunCases((rc) => rc.map((c) => (c.id === runCaseId ? previous : c)));
      toast.error("No se guardó el resultado", "Revisa tu conexión e intenta de nuevo.");
    }
  }

  async function saveComment(runCaseId: string, comment: string) {
    const current = runCases.find((c) => c.id === runCaseId);
    if ((current?.comment || "") === comment) return;
    const res = await fetch(`/api/run-cases/${runCaseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: current?.status, comment, executedAt: current?.executedAt ?? null }),
    }).catch(() => null);
    if (res?.ok) {
      setRunCases((rc) => rc.map((c) => (c.id === runCaseId ? { ...c, comment } : c)));
      toast.success("Comentario guardado");
    } else {
      toast.error("No se guardó el comentario", "Tu texto sigue en el campo; intenta de nuevo.");
    }
  }

  async function saveExecutedAt(runCaseId: string, dateStr: string) {
    const executedAt = dateStr ? new Date(`${dateStr}T12:00:00`).toISOString() : null;
    setRunCases((rc) => rc.map((c) => (c.id === runCaseId ? { ...c, executedAt } : c)));
    const current = runCases.find((c) => c.id === runCaseId);
    const res = await fetch(`/api/run-cases/${runCaseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: current?.status, executedAt }),
    }).catch(() => null);
    if (!res?.ok) toast.error("No se guardó la fecha de ejecución");
  }

  // Shared by both upload paths: reads a fetch Response, and on failure
  // extracts a server error message (falling back to the raw status when the
  // body isn't JSON — e.g. a proxy's own error page).
  async function readUploadResult(
    runCaseId: string,
    res: Response
  ): Promise<{ id: string; filename: string; url: string; mimeType: string } | null> {
    if (res.ok) return res.json();
    const rawText = await res.text().catch(() => "");
    console.error("Evidence upload failed:", res.status, rawText);
    let serverMessage: string | undefined;
    try {
      serverMessage = JSON.parse(rawText)?.error;
    } catch {
      // non-JSON error body (e.g. a proxy/platform error page) — fall through
    }
    setUploadError({
      runCaseId,
      message: serverMessage || `No se pudo subir el archivo (HTTP ${res.status}).`,
    });
    return null;
  }

  async function uploadEvidence(runCaseId: string, file: File) {
    setUploadError(null);
    if (file.type.startsWith("video/")) {
      try {
        const duration = await getVideoDuration(file);
        if (duration > MAX_VIDEO_SECONDS) {
          setUploadError({
            runCaseId,
            message: `El video dura ${Math.round(duration)}s — el máximo permitido es ${MAX_VIDEO_SECONDS}s.`,
          });
          return;
        }
      } catch {
        setUploadError({ runCaseId, message: "No se pudo leer la duración del video." });
        return;
      }
    }

    let attachment: { id: string; filename: string; url: string; mimeType: string } | null;
    try {
      attachment =
        file.size > CHUNK_THRESHOLD_BYTES
          ? await uploadInChunks(runCaseId, file)
          : await uploadWhole(runCaseId, file);
    } catch (err) {
      console.error("Evidence upload network error:", err);
      setUploadError({
        runCaseId,
        message: "No se pudo conectar con el servidor para subir el archivo.",
      });
      return;
    }

    if (attachment) {
      setRunCases((rc) =>
        rc.map((c) =>
          c.id === runCaseId ? { ...c, attachments: [...c.attachments, attachment!] } : c
        )
      );
      toast.success("Evidencia subida", file.name);
    }
  }

  async function uploadWhole(runCaseId: string, file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/run-cases/${runCaseId}/attachments`, {
      method: "POST",
      body: fd,
    });
    return readUploadResult(runCaseId, res);
  }

  // Splits large files into small requests so proxies/tunnels that reject big
  // request bodies (413) never see more than CHUNK_SIZE_BYTES at once.
  async function uploadInChunks(runCaseId: string, file: File) {
    const uploadId = crypto.randomUUID();
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE_BYTES);

    for (let i = 0; i < totalChunks; i++) {
      const chunk = file.slice(i * CHUNK_SIZE_BYTES, (i + 1) * CHUNK_SIZE_BYTES);
      const fd = new FormData();
      fd.append("chunk", chunk);
      fd.append("uploadId", uploadId);
      fd.append("chunkIndex", String(i));
      fd.append("totalChunks", String(totalChunks));
      fd.append("filename", file.name);
      fd.append("mimeType", file.type);

      const res = await fetch(`/api/run-cases/${runCaseId}/attachments/chunk`, {
        method: "POST",
        body: fd,
      });

      if (i === totalChunks - 1) {
        return readUploadResult(runCaseId, res);
      }
      if (!res.ok) {
        return readUploadResult(runCaseId, res);
      }
    }
    return null;
  }

  async function removeAttachment(runCaseId: string, attachmentId: string) {
    setPendingDeleteAttachment(null);
    const res = await fetch(`/api/attachments/${attachmentId}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(await errorMessage(res, "No se pudo eliminar la evidencia"));
      return;
    }
    toast.success("Evidencia eliminada");
    setRunCases((rc) =>
      rc.map((c) =>
        c.id === runCaseId
          ? { ...c, attachments: c.attachments.filter((a) => a.id !== attachmentId) }
          : c
      )
    );
  }

  async function createDefect(title: string, severity: string) {
    if (!pendingDefect) return;
    const { runCaseId } = pendingDefect;
    setReportingDefect(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/defects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, runCaseId, severity }),
      });
      if (res.ok) {
        const defect = await res.json();
        setRunCases((rc) =>
          rc.map((c) =>
            c.id === runCaseId ? { ...c, defects: [...c.defects, defect] } : c
          )
        );
        setPendingDefect(null);
        toast.success("Defecto reportado", defect.title);
      } else {
        toast.error(await errorMessage(res, "No se pudo reportar el defecto"));
      }
    } finally {
      setReportingDefect(false);
    }
  }

  if (loading)
    return (
      <p className="flex items-center gap-2 text-sm text-slate-400">
        <Loader2 size={16} className="animate-spin" aria-hidden /> Cargando ejecución...
      </p>
    );
  if (loadError) return <p className="text-sm text-red-600">{loadError}</p>;

  const stats = runCases.reduce(
    (acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  const total = runCases.length;

  return (
    <div>
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">{run?.name}</h2>
          <span className="text-sm text-slate-500">
            <span className="font-semibold text-slate-900 tabular-nums">
              {total - (stats.untested || 0)}
            </span>{" "}
            de <span className="tabular-nums">{total}</span> ejecutados
          </span>
        </div>
        {(run?.branch || run?.commitSha || run?.ciUrl) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-slate-500">
            {run.branch && (
              <span className="flex items-center gap-1" title="Rama">
                <GitBranch size={13} aria-hidden /> {run.branch}
              </span>
            )}
            {run.commitSha && (
              <span className="flex items-center gap-1 font-mono" title={run.commitSha}>
                <GitCommitHorizontal size={13} aria-hidden /> {run.commitSha.slice(0, 7)}
              </span>
            )}
            {run.ciUrl && (
              <a
                href={run.ciUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-brand-700 hover:underline"
              >
                <ExternalLink size={13} aria-hidden /> Ver build en CI
              </a>
            )}
          </div>
        )}
        {total > 0 && (
          <div className="flex h-2 rounded-full overflow-hidden bg-slate-100 mt-3">
            {STATUS_ORDER.map((s) =>
              stats[s] ? (
                <div
                  key={s}
                  className={STATUS_FILL[s]}
                  style={{ width: `${(stats[s] / total) * 100}%` }}
                  title={`${STATUS_META[s].label}: ${stats[s]}`}
                />
              ) : null
            )}
          </div>
        )}
        <div className="flex gap-1.5 mt-3 flex-wrap">
          {STATUS_ORDER.map((s) => (
            <StatusBadge
              key={s}
              status={s}
              label={
                <>
                  <span className="tabular-nums">{stats[s] || 0}</span> {STATUS_META[s].label}
                </>
              }
            />
          ))}
        </div>
      </div>

      {runCases.length === 0 && (
        <EmptyState icon={ListChecks} title="Este run no tiene casos" />
      )}

      <div className="space-y-2">
        {runCases.map((c) => {
          const steps: Step[] = JSON.parse(c.caseSteps || "[]");
          const isOpen = expanded === c.id;
          return (
            <div
              key={c.id}
              className={cn(
                "bg-white border rounded-xl shadow-sm transition-colors",
                isOpen ? "border-brand-300" : "border-slate-200"
              )}
            >
              <div
                className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer"
                onClick={() => setExpanded(isOpen ? null : c.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <ChevronRight
                    size={16}
                    aria-hidden
                    className={cn("shrink-0 text-slate-400 transition-transform", isOpen && "rotate-90")}
                  />
                  <StatusBadge status={c.status as RunStatus} className="shrink-0" />
                  <CodeBadge code={c.caseCode} className="shrink-0" />
                  <span className="text-sm font-medium text-slate-900 truncate">{c.caseTitle}</span>
                  {c.caseAutomated && <AutomatedBadge label="Auto" className="shrink-0" />}
                </div>
                <div className="flex items-center gap-1 shrink-0" role="group" aria-label="Resultado">
                  {(["passed", "failed", "blocked", "skipped"] as const).map((s) => {
                    const Icon = STATUS_META[s].icon;
                    const active = c.status === s;
                    return (
                      <button
                        key={s}
                        title={STATUS_META[s].label}
                        aria-label={STATUS_META[s].label}
                        aria-pressed={active}
                        onClick={(e) => {
                          e.stopPropagation();
                          setStatus(c.id, s);
                        }}
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-lg border transition-colors",
                          active
                            ? `${STATUS_FILL[s]} border-transparent text-white shadow-sm`
                            : "border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                        )}
                      >
                        <Icon size={16} aria-hidden />
                      </button>
                    );
                  })}
                </div>
              </div>

              {isOpen && (
                <div className="border-t border-slate-100 p-4 space-y-4">
                  {c.casePreconditions && (
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-1">
                        Precondiciones
                      </p>
                      <p className="text-sm text-slate-700">{c.casePreconditions}</p>
                    </div>
                  )}
                  {steps.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-1">Pasos</p>
                      <table className="w-full text-sm">
                        <tbody>
                          {steps.map((s, i) => (
                            <tr key={i} className="border-t border-slate-100">
                              <td className="py-1.5 pr-3 text-slate-400 align-top w-6">
                                {i + 1}
                              </td>
                              <td className="py-1.5 pr-3 text-slate-700 align-top">{s.step}</td>
                              <td className="py-1.5 text-slate-500 align-top">{s.expected}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {c.errorMessage && (
                    <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                      <p className="text-xs font-medium text-red-700 mb-1">
                        Error (Playwright)
                      </p>
                      <pre className="text-xs text-red-700 whitespace-pre-wrap font-mono overflow-x-auto">
                        {stripAnsi(c.errorMessage)}
                      </pre>
                    </div>
                  )}

                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1">Comentario</p>
                    <Textarea
                      defaultValue={c.comment || ""}
                      onBlur={(e) => saveComment(c.id, e.target.value)}
                      rows={2}
                      placeholder="Notas sobre esta ejecución..."
                    />
                  </div>

                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1">Evidencia</p>
                    {uploadError?.runCaseId === c.id && (
                      <p className="text-xs text-red-600 mb-1.5">{uploadError.message}</p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      {c.attachments.map((a) => {
                        const isVideo = a.mimeType.startsWith("video/");
                        const isImage = a.mimeType.startsWith("image/");
                        const isTrace = !isVideo && !isImage;
                        return (
                          <div key={a.id} className="relative group w-16 h-16 shrink-0">
                            <a
                              href={a.url}
                              target="_blank"
                              rel="noreferrer"
                              download={isTrace ? a.filename : undefined}
                              title={
                                isTrace
                                  ? `${a.filename} · Descárgalo y ábrelo en trace.playwright.dev`
                                  : a.filename
                              }
                              className="relative block w-full h-full rounded-lg border border-slate-200 overflow-hidden"
                            >
                              {isVideo ? (
                                <>
                                  <video src={a.url} className="w-full h-full object-cover" muted />
                                  <span className="absolute inset-0 flex items-center justify-center bg-slate-900/25 text-white">
                                    <Play size={18} aria-hidden />
                                  </span>
                                </>
                              ) : isImage ? (
                                <img
                                  src={a.url}
                                  alt={a.filename}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span className="flex h-full w-full flex-col items-center justify-center gap-0.5 bg-slate-50 text-slate-500">
                                  <FileArchive size={18} aria-hidden />
                                  <span className="text-[10px] font-medium">Trace</span>
                                </span>
                              )}
                            </a>
                            <button
                              type="button"
                              onClick={() =>
                                setPendingDeleteAttachment({ runCaseId: c.id, attachmentId: a.id })
                              }
                              title="Eliminar evidencia"
                              aria-label="Eliminar evidencia"
                              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-700 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-600"
                            >
                              <X size={12} aria-hidden />
                            </button>
                          </div>
                        );
                      })}
                      <label
                        title="Subir evidencia (imagen o video, máx. 200s)"
                        className="flex items-center justify-center w-16 h-16 rounded-lg border-2 border-dashed border-slate-300 text-slate-400 cursor-pointer hover:border-brand-400 hover:text-brand-600 shrink-0"
                      >
                        <ImagePlus size={20} aria-hidden />
                        <input
                          type="file"
                          accept="image/*,video/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadEvidence(c.id, file);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="flex items-center justify-end">
                    <Button
                      variant="secondary"
                      size="xs"
                      icon={Bug}
                      className="text-red-600"
                      onClick={() => setPendingDefect({ runCaseId: c.id, caseTitle: c.caseTitle })}
                    >
                      Reportar defecto
                    </Button>
                  </div>

                  {c.defects.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {c.defects.map((d) => (
                        <Badge key={d.id} tone="danger" icon={Bug}>
                          {d.title}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2 flex-wrap text-xs text-slate-400">
                    {c.executedByName && <span>Ejecutado por {c.executedByName}</span>}
                    {run?.source === "manual" ? (
                      <label className="flex items-center gap-1">
                        <span>Fecha de ejecución</span>
                        <input
                          type="date"
                          value={c.executedAt ? toLocalDateStr(c.executedAt) : ""}
                          onChange={(e) => saveExecutedAt(c.id, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded border border-slate-200 px-1.5 py-0.5 text-xs text-slate-600"
                        />
                      </label>
                    ) : (
                      c.executedAt && <span>{new Date(c.executedAt).toLocaleString("es-CR")}</span>
                    )}
                    {c.durationMs != null && <span>{c.durationMs}ms</span>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ConfirmModal
        open={pendingDeleteAttachment !== null}
        message="¿Eliminar esta evidencia?"
        onConfirm={() =>
          pendingDeleteAttachment &&
          removeAttachment(pendingDeleteAttachment.runCaseId, pendingDeleteAttachment.attachmentId)
        }
        onCancel={() => setPendingDeleteAttachment(null)}
      />

      <ReportDefectModal
        open={pendingDefect !== null}
        caseTitle={pendingDefect?.caseTitle || ""}
        submitting={reportingDefect}
        onConfirm={createDefect}
        onCancel={() => setPendingDefect(null)}
      />
    </div>
  );
}
