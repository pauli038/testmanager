"use client";

import { useState } from "react";
import { Button, Card, Input } from "@/components/ui";
import { BarChart3, CalendarDays, Download } from "lucide-react";

type Kind = "daily" | "general";
type Format = "docx" | "pdf";

function FormatButtons({
  kind,
  downloading,
  onDownload,
}: {
  kind: Kind;
  downloading: `${Kind}-${Format}` | null;
  onDownload: (kind: Kind, format: Format) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        icon={Download}
        onClick={() => onDownload(kind, "docx")}
        disabled={downloading !== null && downloading !== `${kind}-docx`}
        loading={downloading === `${kind}-docx`}
      >
        Word
      </Button>
      <Button
        size="sm"
        variant="secondary"
        icon={Download}
        onClick={() => onDownload(kind, "pdf")}
        disabled={downloading !== null && downloading !== `${kind}-pdf`}
        loading={downloading === `${kind}-pdf`}
      >
        PDF
      </Button>
    </div>
  );
}

function ReportTitle({ icon: Icon, children }: { icon: typeof Download; children: React.ReactNode }) {
  return (
    <h4 className="flex items-center gap-2 font-semibold text-slate-900 text-sm mb-1">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
        <Icon size={15} aria-hidden />
      </span>
      {children}
    </h4>
  );
}

export default function ReportsPanel({ projectId }: { projectId: string }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [downloading, setDownloading] = useState<`${Kind}-${Format}` | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function download(kind: Kind, format: Format) {
    const key = `${kind}-${format}` as const;
    setDownloading(key);
    setErrorMsg(null);
    try {
      const base =
        kind === "daily"
          ? `/api/projects/${projectId}/reports/daily?date=${date}`
          : `/api/projects/${projectId}/reports/general`;
      const url = `${base}${base.includes("?") ? "&" : "?"}format=${format}`;
      const res = await fetch(url);
      if (!res.ok) {
        setErrorMsg("No se pudo generar el reporte.");
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="(.+?)"/);
      const filename = match?.[1] || `reporte-${kind}.${format}`;
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
        <Card>
          <ReportTitle icon={CalendarDays}>Reporte del día</ReportTitle>
          <p className="text-sm text-slate-500 mb-4">
            Cuántos test cases, test runs, planes y defectos se crearon en una fecha específica.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-auto h-8"
            />
            <FormatButtons kind="daily" downloading={downloading} onDownload={download} />
          </div>
        </Card>

        <Card>
          <ReportTitle icon={BarChart3}>Reporte general</ReportTitle>
          <p className="text-sm text-slate-500 mb-4">
            Totales acumulados del proyecto: suites, casos, planes, runs y defectos.
          </p>
          <FormatButtons kind="general" downloading={downloading} onDownload={download} />
        </Card>
      </div>
    </div>
  );
}
