"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPaste, FileSpreadsheet, Upload } from "lucide-react";
import { Badge, Button, Modal, Segmented, Textarea, errorMessage, useToast } from "@/components/ui";
import { parseCsv } from "@/lib/csv";
import { rowsToRequirements, textToRequirements, type RequirementRow } from "@/lib/requirement-key";

const EXAMPLE = `RF-001 Registro de compras
RF-002 Gestión de usuarios
RF-003 Catálogo de proveedores
RNF-005 Accesibilidad`;

export default function RequirementsImportModal({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"paste" | "file">("paste");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileResult, setFileResult] = useState<{ items: RequirementRow[]; invalid: string[] } | null>(null);
  const [fileError, setFileError] = useState("");
  const [saving, setSaving] = useState(false);

  const parsed = useMemo(
    () => (mode === "paste" ? textToRequirements(text) : fileResult ?? { items: [], invalid: [] }),
    [mode, text, fileResult]
  );

  function readFile(file: File) {
    setFileName(file.name);
    setFileError("");
    setFileResult(null);
    const reader = new FileReader();
    if (/\.xlsx?$/i.test(file.name)) {
      reader.onload = async () => {
        try {
          const XLSX = await import("xlsx");
          const wb = XLSX.read(new Uint8Array(reader.result as ArrayBuffer), { type: "array" });
          const rows: string[][] = XLSX.utils
            .sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" })
            .map((row) => row.map((cell) => String(cell ?? "")));
          setFileResult(rowsToRequirements(rows));
        } catch {
          setFileError("No se pudo leer el archivo Excel. Verifica que sea un .xlsx válido.");
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = () => setFileResult(rowsToRequirements(parseCsv(String(reader.result || ""))));
      reader.readAsText(file, "utf-8");
    }
  }

  async function save() {
    if (parsed.items.length === 0) return;
    setSaving(true);
    const res = await fetch(`/api/projects/${projectId}/requirements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: parsed.items }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      toast.error(res ? await errorMessage(res, "No se pudo cargar la lista") : "No se pudo conectar con el servidor");
      return;
    }
    const { created, updated } = await res.json();
    toast.success(
      "Requisitos cargados",
      `${created} nuevo${created === 1 ? "" : "s"}${updated ? ` · ${updated} actualizado${updated === 1 ? "" : "s"}` : ""}`
    );
    onClose();
    router.refresh();
  }

  return (
    <Modal
      onClose={onClose}
      size="lg"
      title="Cargar lista de requisitos"
      description="Así la matriz también muestra los requisitos que todavía no tienen casos de prueba. Los que ya existan se actualizan; no se borra nada."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button icon={Upload} onClick={save} loading={saving} disabled={parsed.items.length === 0}>
            Cargar {parsed.items.length || ""} requisito{parsed.items.length === 1 ? "" : "s"}
          </Button>
        </>
      }
    >
      <Segmented
        value={mode}
        onChange={setMode}
        className="mb-4"
        options={[
          { value: "paste", label: "Pegar lista", icon: ClipboardPaste },
          { value: "file", label: "Subir Excel o CSV", icon: FileSpreadsheet },
        ]}
      />

      {mode === "paste" ? (
        <>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder={EXAMPLE}
            className="font-mono text-xs"
            aria-label="Lista de requisitos"
          />
          <p className="text-xs text-slate-500 mt-1.5">
            Un requisito por línea: el código y, si quieres, su nombre. Puedes copiar las dos
            columnas directamente desde Excel.
          </p>
        </>
      ) : (
        <>
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) readFile(f);
            }}
            className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/30"
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) readFile(f);
                e.target.value = "";
              }}
            />
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <FileSpreadsheet size={18} aria-hidden />
            </div>
            <p className="text-sm text-slate-600">
              {fileName ? (
                <span className="font-medium">{fileName}</span>
              ) : (
                "Arrastra un archivo .xlsx o .csv aquí, o haz clic para elegirlo"
              )}
            </p>
          </div>
          {fileError && <p className="text-sm text-red-600 mt-2">{fileError}</p>}
          <p className="text-xs text-slate-500 mt-1.5">
            Se usa la primera hoja. Si tiene encabezados, se buscan las columnas{" "}
            <code>requisito</code> (o <code>código</code>) y <code>descripción</code> (o{" "}
            <code>nombre</code>); si no, la primera columna es el código y la segunda el nombre.
          </p>
        </>
      )}

      {(parsed.items.length > 0 || parsed.invalid.length > 0) && (
        <div className="mt-4 rounded-lg border border-slate-200">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50/60 text-xs">
            <Badge tone="success">
              {parsed.items.length} válido{parsed.items.length === 1 ? "" : "s"}
            </Badge>
            {parsed.invalid.length > 0 && (
              <Badge tone="warning">
                {parsed.invalid.length} no reconocido{parsed.invalid.length === 1 ? "" : "s"}
              </Badge>
            )}
          </div>
          <ul className="max-h-48 overflow-y-auto divide-y divide-slate-100 text-sm">
            {parsed.items.map((r) => (
              <li key={r.key} className="flex gap-3 px-3 py-1.5">
                <span className="font-mono text-xs font-medium text-slate-700 w-20 shrink-0 pt-px">{r.key}</span>
                <span className="text-slate-600 truncate">{r.title ?? <span className="text-slate-400">Sin nombre</span>}</span>
              </li>
            ))}
            {parsed.invalid.map((v, i) => (
              <li key={`x${i}`} className="flex gap-3 px-3 py-1.5 bg-amber-50/50">
                <span className="text-xs text-amber-700 w-20 shrink-0 pt-px">Se omite</span>
                <span className="text-slate-500 truncate">{v}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
