"use client";

import { useState } from "react";

export default function ReportsPanel({ projectId }: { projectId: string }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [downloading, setDownloading] = useState<"daily" | "general" | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function download(kind: "daily" | "general") {
    setDownloading(kind);
    setErrorMsg(null);
    try {
      const url =
        kind === "daily"
          ? `/api/projects/${projectId}/reports/daily?date=${date}`
          : `/api/projects/${projectId}/reports/general`;
      const res = await fetch(url);
      if (!res.ok) {
        setErrorMsg("No se pudo generar el reporte.");
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="(.+?)"/);
      const filename = match?.[1] || `reporte-${kind}.docx`;
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

  return (
    <div>
      <h3 className="text-sm font-medium text-slate-700 mb-4">Reportes</h3>
      {errorMsg && <p className="text-sm text-red-600 mb-3">{errorMsg}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <h4 className="font-medium text-slate-900 text-sm mb-1">📅 Reporte del día</h4>
          <p className="text-sm text-slate-500 mb-4">
            Cuántos test cases, test runs, planes y defectos se crearon en una fecha específica.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
            <button
              onClick={() => download("daily")}
              disabled={downloading === "daily"}
              className="rounded-lg bg-teal-600 text-white text-sm font-medium px-3 py-1.5 hover:bg-teal-700 disabled:opacity-50"
            >
              {downloading === "daily" ? "Generando..." : "⬇ Descargar (Word)"}
            </button>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <h4 className="font-medium text-slate-900 text-sm mb-1">📊 Reporte general</h4>
          <p className="text-sm text-slate-500 mb-4">
            Totales acumulados del proyecto: suites, casos, planes, runs y defectos.
          </p>
          <button
            onClick={() => download("general")}
            disabled={downloading === "general"}
            className="rounded-lg bg-teal-600 text-white text-sm font-medium px-3 py-1.5 hover:bg-teal-700 disabled:opacity-50"
          >
            {downloading === "general" ? "Generando..." : "⬇ Descargar (Word)"}
          </button>
        </div>
      </div>
    </div>
  );
}
