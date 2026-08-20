"use client";

import { useEffect, useState } from "react";

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
  caseTitle: string;
  caseSteps: string;
  casePreconditions: string | null;
  casePriority: string;
  caseAutomated: boolean;
  attachments: { id: string; url: string; filename: string }[];
  defects: { id: string; title: string; status: string }[];
};

const statusConfig: Record<string, { label: string; icon: string; classes: string }> = {
  untested: { label: "Sin probar", icon: "⚪", classes: "bg-slate-100 text-slate-600" },
  passed: { label: "Passed", icon: "✅", classes: "bg-emerald-100 text-emerald-700" },
  failed: { label: "Failed", icon: "❌", classes: "bg-red-100 text-red-700" },
  blocked: { label: "Blocked", icon: "🚫", classes: "bg-orange-100 text-orange-700" },
  skipped: { label: "Skipped", icon: "⏭️", classes: "bg-slate-100 text-slate-500" },
};

export default function RunExecution({
  projectId,
  runId,
}: {
  projectId: string;
  runId: string;
}) {
  const [run, setRun] = useState<any>(null);
  const [runCases, setRunCases] = useState<RunCase[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await fetch(`/api/runs/${runId}`);
    const data = await res.json();
    setRun(data.run);
    setRunCases(data.runCases);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [runId]);

  async function setStatus(runCaseId: string, status: string) {
    setRunCases((rc) =>
      rc.map((c) => (c.id === runCaseId ? { ...c, status: status as any } : c))
    );
    await fetch(`/api/run-cases/${runCaseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }

  async function saveComment(runCaseId: string, comment: string) {
    await fetch(`/api/run-cases/${runCaseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: runCases.find((c) => c.id === runCaseId)?.status, comment }),
    });
  }

  async function uploadEvidence(runCaseId: string, file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/run-cases/${runCaseId}/attachments`, {
      method: "POST",
      body: fd,
    });
    if (res.ok) {
      const attachment = await res.json();
      setRunCases((rc) =>
        rc.map((c) =>
          c.id === runCaseId ? { ...c, attachments: [...c.attachments, attachment] } : c
        )
      );
    }
  }

  async function createDefect(runCaseId: string, caseTitle: string) {
    const title = prompt(`Título del defecto para "${caseTitle}":`);
    if (!title) return;
    const res = await fetch(`/api/projects/${projectId}/defects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, runCaseId, severity: "high" }),
    });
    if (res.ok) {
      const defect = await res.json();
      setRunCases((rc) =>
        rc.map((c) =>
          c.id === runCaseId ? { ...c, defects: [...c.defects, defect] } : c
        )
      );
    }
  }

  if (loading) return <p className="text-sm text-slate-400">Cargando ejecución...</p>;

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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{run?.name}</h2>
          <div className="flex gap-3 mt-1 text-xs text-slate-500">
            {Object.entries(statusConfig).map(([key, cfg]) => (
              <span key={key}>
                {cfg.icon} {stats[key] || 0} {cfg.label}
              </span>
            ))}
            <span>· {total} total</span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {runCases.map((c) => {
          const steps: Step[] = JSON.parse(c.caseSteps || "[]");
          const isOpen = expanded === c.id;
          return (
            <div key={c.id} className="bg-white border border-slate-200 rounded-lg">
              <div
                className="flex items-center justify-between p-4 cursor-pointer"
                onClick={() => setExpanded(isOpen ? null : c.id)}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs rounded px-2 py-1 ${statusConfig[c.status].classes}`}
                  >
                    {statusConfig[c.status].icon} {statusConfig[c.status].label}
                  </span>
                  <span className="text-sm font-medium text-slate-900">{c.caseTitle}</span>
                  {c.caseAutomated && (
                    <span className="text-xs bg-purple-100 text-purple-700 rounded px-1.5 py-0.5">
                      🤖
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {(["passed", "failed", "blocked", "skipped"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={(e) => {
                        e.stopPropagation();
                        setStatus(c.id, s);
                      }}
                      className={`text-xs rounded px-2 py-1 border ${
                        c.status === s
                          ? statusConfig[s].classes + " border-transparent"
                          : "border-slate-200 text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      {statusConfig[s].icon}
                    </button>
                  ))}
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
                      <pre className="text-xs text-red-700 whitespace-pre-wrap">
                        {c.errorMessage}
                      </pre>
                    </div>
                  )}

                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1">Comentario</p>
                    <textarea
                      defaultValue={c.comment || ""}
                      onBlur={(e) => saveComment(c.id, e.target.value)}
                      rows={2}
                      placeholder="Notas sobre esta ejecución..."
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      {c.attachments.map((a) => (
                        <a
                          key={a.id}
                          href={a.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block w-16 h-16 rounded border border-slate-200 overflow-hidden"
                        >
                          <img src={a.url} alt={a.filename} className="w-full h-full object-cover" />
                        </a>
                      ))}
                      <label className="text-xs text-indigo-600 cursor-pointer hover:underline">
                        📸 Subir evidencia
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadEvidence(c.id, file);
                          }}
                        />
                      </label>
                    </div>
                    <button
                      onClick={() => createDefect(c.id, c.caseTitle)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      🐞 Reportar defecto
                    </button>
                  </div>

                  {c.defects.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {c.defects.map((d) => (
                        <span
                          key={d.id}
                          className="text-xs bg-red-50 text-red-700 border border-red-100 rounded px-2 py-1"
                        >
                          🐞 {d.title}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="text-xs text-slate-400">
                    {c.executedByName && <span>Ejecutado por {c.executedByName} · </span>}
                    {c.executedAt && <span>{new Date(c.executedAt).toLocaleString("es-CR")}</span>}
                    {c.durationMs != null && <span> · {c.durationMs}ms</span>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
