"use client";

import { useEffect, useState } from "react";
import ConfirmModal from "./ConfirmModal";
import { Button, errorMessage, useToast } from "@/components/ui";
import { CloudUpload, Database, Loader2 } from "lucide-react";

type Summary = { total: number; dbOnly: number; both: number; bucketOnly: number; dbBytes: number };
type Result = { id: string; filename: string; ok: boolean; message?: string };
type Step = "copy" | "clear";

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

// Admin tool to move evidence from the database to the storage bucket, in the
// same two verified steps as scripts/migrate-attachments-to-storage.ts.
export default function AttachmentMigration() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [running, setRunning] = useState<Step | null>(null);
  const [log, setLog] = useState<Result[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);
  const toast = useToast();

  useEffect(() => {
    fetch("/api/attachments/migration")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setEnabled(data.storageEnabled);
        setSummary(data.summary);
      });
  }, []);

  async function run(step: Step) {
    setRunning(step);
    setLog([]);
    let after = "";
    let ok = 0;
    let failed = 0;
    try {
      for (;;) {
        const res = await fetch("/api/attachments/migration", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ step, after }),
        });
        if (!res.ok) {
          toast.error(await errorMessage(res, "Se detuvo la migración"), "Puedes volver a intentarlo: retoma donde quedó.");
          return;
        }
        const data: { results: Result[]; after: string; done: boolean; summary: Summary } = await res.json();
        after = data.after;
        setSummary(data.summary);
        setLog((l) => [...data.results, ...l]);
        ok += data.results.filter((r) => r.ok).length;
        failed += data.results.filter((r) => !r.ok).length;
        if (data.done) break;
      }
      const verb = step === "copy" ? "copiadas al bucket" : "liberadas de la base de datos";
      if (failed) toast.error(`${ok} ${verb}, ${failed} con error`, "Las que fallaron siguen en la base de datos.");
      else toast.success(`${ok} evidencias ${verb}`);
    } catch {
      toast.error("Se perdió la conexión", "Puedes volver a intentarlo: retoma donde quedó.");
    } finally {
      setRunning(null);
    }
  }

  if (enabled === null || !summary) return null;

  return (
    <div className="mt-10">
      <h2 className="text-sm font-medium text-slate-700 mb-1">Evidencias en Supabase Storage</h2>
      <p className="text-sm text-slate-500 mb-3">
        Pasa las evidencias guardadas en la base de datos al bucket. Cada archivo se verifica antes de
        cambiar nada, y los que fallan se quedan como estaban.
      </p>
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-4">
        {!enabled && (
          <p className="text-sm text-amber-700">
            Falta configurar <code>SUPABASE_URL</code> y <code>SUPABASE_SERVICE_ROLE_KEY</code> en el
            hosting. Mientras tanto las evidencias se siguen guardando en la base de datos.
          </p>
        )}
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          {[
            ["Solo en la base de datos", summary.dbOnly],
            ["En el bucket y en la base", summary.both],
            ["Solo en el bucket", summary.bucketOnly],
            ["Ocupan en la base", `~${mb(summary.dbBytes)}`],
          ].map(([label, value]) => (
            <div key={label as string}>
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="font-semibold text-slate-900 tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button
            icon={CloudUpload}
            disabled={!enabled || running !== null || summary.dbOnly === 0}
            loading={running === "copy"}
            onClick={() => run("copy")}
          >
            1. Copiar al bucket
          </Button>
          <Button
            variant="secondary"
            icon={Database}
            disabled={!enabled || running !== null || summary.both === 0}
            loading={running === "clear"}
            onClick={() => setConfirmClear(true)}
          >
            2. Liberar la base de datos
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          El paso 1 no borra nada. Antes del paso 2 revisa que las evidencias de runs y defectos se ven
          bien; después corre <code>VACUUM FULL attachments;</code> en el SQL Editor de Supabase para que se
          note el espacio liberado.
        </p>
        {running && (
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <Loader2 size={14} className="animate-spin" aria-hidden /> No cierres esta página hasta que termine.
          </p>
        )}
        {log.length > 0 && (
          <ul className="max-h-48 overflow-y-auto text-xs font-mono space-y-0.5">
            {log.map((r) => (
              <li key={`${r.id}-${r.ok}`} className={r.ok ? "text-slate-600" : "text-red-600"}>
                {r.ok ? "✔" : "✘"} {r.filename}
                {r.message ? ` — ${r.message}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmModal
        open={confirmClear}
        title="¿Liberar la base de datos?"
        message="Se borrará de la base de datos la copia de cada evidencia que ya está en el bucket, solo después de comprobar otra vez que el archivo del bucket es idéntico."
        confirmLabel="Liberar"
        onConfirm={() => {
          setConfirmClear(false);
          run("clear");
        }}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}
