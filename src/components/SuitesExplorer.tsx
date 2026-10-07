"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import ConfirmModal from "./ConfirmModal";
import { CSV_TEMPLATE, parseCsv, rowsToCases } from "@/lib/csv";
import {
  AutomatedBadge,
  Badge,
  Button,
  EmptyState,
  IconButton,
  Input,
  Label,
  Modal,
  PriorityBadge,
  Select,
  StatusBadge,
  Textarea,
  type RunStatus,
} from "@/components/ui";
import { Eye, FileText, Folder, FolderOpen, Pencil, Plus, Trash2, Upload, X } from "lucide-react";

type Suite = { id: string; name: string; description: string | null };
type Step = { step: string; expected: string };
type TestCase = {
  id: string;
  suiteId: string;
  title: string;
  preconditions: string | null;
  steps: string;
  priority: string;
  type: string;
  tags: string;
  automated: boolean;
  automationId: string | null;
  lastStatus?: string | null;
};

const isRunStatus = (s: string | null | undefined): s is RunStatus =>
  s === "passed" || s === "failed" || s === "blocked" || s === "skipped";

export default function SuitesExplorer({
  projectId,
  initialSuites,
  initialCases,
  headerActionsContainer,
}: {
  projectId: string;
  initialSuites: Suite[];
  initialCases: Record<string, TestCase[]>;
  headerActionsContainer?: HTMLDivElement | null;
}) {
  const router = useRouter();
  const [suites, setSuites] = useState(initialSuites);
  const [casesBySuite, setCasesBySuite] = useState(initialCases);
  const [selectedSuite, setSelectedSuite] = useState<string | null>(
    initialSuites[0]?.id || null
  );
  const [newSuiteName, setNewSuiteName] = useState("");
  const [showCaseModal, setShowCaseModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingCase, setEditingCase] = useState<TestCase | null>(null);
  const [viewingCase, setViewingCase] = useState<TestCase | null>(null);
  const [pendingDeleteSuite, setPendingDeleteSuite] = useState<string | null>(null);
  const [pendingDeleteCase, setPendingDeleteCase] = useState<{ caseId: string; suiteId: string } | null>(
    null
  );

  async function createSuite(e: React.FormEvent) {
    e.preventDefault();
    if (!newSuiteName.trim()) return;
    const res = await fetch(`/api/projects/${projectId}/suites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newSuiteName }),
    });
    if (res.ok) {
      const suite = await res.json();
      setSuites((s) => [...s, suite]);
      setCasesBySuite((c) => ({ ...c, [suite.id]: [] }));
      setSelectedSuite(suite.id);
      setNewSuiteName("");
    }
  }

  async function deleteSuite(suiteId: string) {
    await fetch(`/api/suites/${suiteId}`, { method: "DELETE" });
    setSuites((s) => s.filter((x) => x.id !== suiteId));
    if (selectedSuite === suiteId) setSelectedSuite(null);
    setPendingDeleteSuite(null);
    router.refresh();
  }

  function openNewCase() {
    setEditingCase(null);
    setShowCaseModal(true);
  }

  function openEditCase(c: TestCase) {
    setEditingCase(c);
    setShowCaseModal(true);
  }

  function openViewCase(c: TestCase) {
    setViewingCase(c);
  }

  async function deleteCase(caseId: string, suiteId: string) {
    await fetch(`/api/cases/${caseId}`, { method: "DELETE" });
    setCasesBySuite((c) => ({
      ...c,
      [suiteId]: c[suiteId].filter((x) => x.id !== caseId),
    }));
    setPendingDeleteCase(null);
  }

  async function reloadCases(suiteId: string) {
    const res = await fetch(`/api/suites/${suiteId}/cases`);
    if (res.ok) {
      const cases = await res.json();
      setCasesBySuite((c) => ({ ...c, [suiteId]: cases }));
    }
  }

  function onCaseSaved(suiteId: string, testCase: TestCase, isNew: boolean) {
    setCasesBySuite((c) => {
      const list = c[suiteId] || [];
      return {
        ...c,
        [suiteId]: isNew
          ? [...list, testCase]
          : list.map((x) => (x.id === testCase.id ? { ...x, ...testCase } : x)),
      };
    });
    setShowCaseModal(false);
  }

  const currentCases = selectedSuite ? casesBySuite[selectedSuite] || [] : [];

  const headerActions = selectedSuite && (
    <>
      <Button
        variant="secondary"
        size="sm"
        icon={Upload}
        onClick={() => setShowImportModal(true)}
      >
        Importar casos
      </Button>
      <Button icon={Plus}
        size="sm"
        onClick={openNewCase}
      >
        Nuevo caso
      </Button>
    </>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <div className="lg:col-span-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Suites</h3>
        <form onSubmit={createSuite} className="flex gap-2 mb-3">
          <Input
            value={newSuiteName}
            onChange={(e) => setNewSuiteName(e.target.value)}
            placeholder="Nueva suite..."
            className="flex-1 h-8"
          />
          <Button type="submit" size="sm" icon={Plus} aria-label="Crear suite" className="px-2.5" />
        </form>
        <ul className="space-y-1">
          {suites.map((s) => (
            <li key={s.id}>
              <div
                className={`group flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm cursor-pointer transition-colors ${
                  selectedSuite === s.id
                    ? "bg-brand-50 text-brand-700 font-medium"
                    : "hover:bg-slate-100 text-slate-700"
                }`}
                onClick={() => setSelectedSuite(s.id)}
              >
                <span className="flex items-center gap-2 min-w-0">
                  {selectedSuite === s.id ? (
                    <FolderOpen size={15} className="shrink-0 text-brand-600" aria-hidden />
                  ) : (
                    <Folder size={15} className="shrink-0 text-slate-400" aria-hidden />
                  )}
                  <span className="truncate">{s.name}</span>
                </span>
                <span className="flex items-center gap-1 shrink-0">
                  <span className="text-xs tabular-nums text-slate-400 group-hover:hidden">
                    {casesBySuite[s.id]?.length ?? 0}
                  </span>
                  <IconButton
                    icon={Trash2}
                    label="Eliminar suite"
                    size="sm"
                    tone="danger"
                    className="hidden group-hover:inline-flex"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDeleteSuite(s.id);
                    }}
                  />
                </span>
              </div>
            </li>
          ))}
          {suites.length === 0 && (
            <p className="text-xs text-slate-400">Crea tu primera suite arriba.</p>
          )}
        </ul>
      </div>

      {headerActionsContainer && headerActions
        ? createPortal(headerActions, headerActionsContainer)
        : null}

      <div className="lg:col-span-3">
        {selectedSuite ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-slate-700">
                Casos de prueba
              </h3>
              {!headerActionsContainer && <div className="flex gap-2">{headerActions}</div>}
            </div>
            <div className="space-y-2">
              {currentCases.map((c) => (
                <div
                  key={c.id}
                  className={`bg-white border rounded-xl p-4 shadow-sm hover:border-brand-300 transition-colors ${
                    c.lastStatus === "passed"
                      ? "border-l-4 border-l-emerald-500 border-slate-200"
                      : c.lastStatus === "failed"
                      ? "border-l-4 border-l-red-500 border-slate-200"
                      : "border-slate-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => openViewCase(c)}
                          className="font-medium text-slate-900 text-sm text-left hover:text-brand-700"
                        >
                          {c.title}
                        </button>
                        {c.automated && <AutomatedBadge />}
                        {isRunStatus(c.lastStatus) && <StatusBadge status={c.lastStatus} />}
                      </div>
                      <div className="flex gap-1.5 mt-2 flex-wrap">
                        <PriorityBadge priority={c.priority} />
                        <Badge>{typeLabels[c.type] || c.type}</Badge>
                        {c.tags &&
                          c.tags.split(",").filter(Boolean).map((t) => (
                            <span
                              key={t}
                              className="text-xs bg-slate-50 border border-slate-200 text-slate-500 rounded px-1.5 py-0.5"
                            >
                              #{t.trim()}
                            </span>
                          ))}
                      </div>
                    </div>
                    <div className="flex gap-0.5 shrink-0">
                      <IconButton icon={Eye} label="Ver caso" onClick={() => openViewCase(c)} />
                      <IconButton icon={Pencil} label="Editar caso" onClick={() => openEditCase(c)} />
                      <IconButton
                        icon={Trash2}
                        label="Eliminar caso"
                        tone="danger"
                        onClick={() => setPendingDeleteCase({ caseId: c.id, suiteId: c.suiteId })}
                      />
                    </div>
                  </div>
                </div>
              ))}
              {currentCases.length === 0 && (
                <EmptyState
                  icon={FileText}
                  title="No hay casos en esta suite todavía"
                  description="Crea uno nuevo o impórtalos desde un CSV."
                  action={
                    <Button icon={Plus} size="sm" onClick={openNewCase}>
                      Nuevo caso
                    </Button>
                  }
                />
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-400">
            Selecciona o crea una suite para ver sus casos de prueba.
          </p>
        )}
      </div>

      {showCaseModal && selectedSuite && (
        <CaseModal
          suiteId={selectedSuite}
          existing={editingCase}
          onClose={() => setShowCaseModal(false)}
          onSaved={onCaseSaved}
        />
      )}

      {showImportModal && selectedSuite && (
        <ImportCsvModal
          suiteId={selectedSuite}
          onClose={() => setShowImportModal(false)}
          onImported={() => {
            reloadCases(selectedSuite);
            router.refresh();
          }}
        />
      )}

      {viewingCase && (
        <ViewCaseModal
          testCase={viewingCase}
          onClose={() => setViewingCase(null)}
          onEdit={() => {
            setViewingCase(null);
            openEditCase(viewingCase);
          }}
        />
      )}

      <ConfirmModal
        open={pendingDeleteSuite !== null}
        message="¿Eliminar esta suite y todos sus casos?"
        onConfirm={() => pendingDeleteSuite && deleteSuite(pendingDeleteSuite)}
        onCancel={() => setPendingDeleteSuite(null)}
      />

      <ConfirmModal
        open={pendingDeleteCase !== null}
        message="¿Eliminar este caso de prueba?"
        onConfirm={() =>
          pendingDeleteCase && deleteCase(pendingDeleteCase.caseId, pendingDeleteCase.suiteId)
        }
        onCancel={() => setPendingDeleteCase(null)}
      />
    </div>
  );
}

const typeLabels: Record<string, string> = {
  functional: "Funcional",
  regression: "Regresión",
  smoke: "Smoke",
  e2e: "E2E",
  api: "API",
  other: "Otro",
};

function ViewCaseModal({
  testCase,
  onClose,
  onEdit,
}: {
  testCase: TestCase;
  onClose: () => void;
  onEdit: () => void;
}) {
  const steps: Step[] = testCase.steps ? JSON.parse(testCase.steps) : [];
  const tags = testCase.tags?.split(",").filter(Boolean) || [];

  return (
    <Modal
      onClose={onClose}
      size="lg"
      title={testCase.title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
          <Button icon={Pencil} onClick={onEdit}>
            Editar
          </Button>
        </>
      }
    >
        <div className="flex gap-1.5 mb-5 flex-wrap">
          {isRunStatus(testCase.lastStatus) && <StatusBadge status={testCase.lastStatus} />}
          {testCase.automated && <AutomatedBadge />}
          <PriorityBadge priority={testCase.priority} />
          <Badge>{typeLabels[testCase.type] || testCase.type}</Badge>
          {tags.map((t) => (
            <span
              key={t}
              className="text-xs bg-slate-50 border border-slate-200 text-slate-500 rounded px-1.5 py-0.5"
            >
              #{t.trim()}
            </span>
          ))}
        </div>

        {testCase.preconditions && (
          <div className="mb-4">
            <h3 className="text-sm font-medium text-slate-700 mb-1">Precondiciones</h3>
            <p className="text-sm text-slate-600 whitespace-pre-wrap">
              {testCase.preconditions}
            </p>
          </div>
        )}

        <div className="mb-4">
          <h3 className="text-sm font-medium text-slate-700 mb-2">
            Pasos y resultado esperado
          </h3>
          {steps.length > 0 ? (
            <div className="space-y-2">
              {steps.map((s, i) => (
                <div
                  key={i}
                  className="flex gap-3 items-start bg-slate-50 border border-slate-200 rounded-lg p-3"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-slate-200 text-[11px] font-medium text-slate-500 tabular-nums">
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm text-slate-800 whitespace-pre-wrap">{s.step}</p>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-slate-400 mb-0.5">Resultado esperado</p>
                    <p className="text-sm text-slate-600 whitespace-pre-wrap">{s.expected}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">Sin pasos definidos.</p>
          )}
        </div>

        {testCase.automated && testCase.automationId && (
          <div className="mb-4">
            <h3 className="text-sm font-medium text-slate-700 mb-1">
              ID/título del test en Playwright
            </h3>
            <p className="text-sm text-slate-600 font-mono break-all">{testCase.automationId}</p>
          </div>
        )}
    </Modal>
  );
}

function CaseModal({
  suiteId,
  existing,
  onClose,
  onSaved,
}: {
  suiteId: string;
  existing: TestCase | null;
  onClose: () => void;
  onSaved: (suiteId: string, c: TestCase, isNew: boolean) => void;
}) {
  const [title, setTitle] = useState(existing?.title || "");
  const [preconditions, setPreconditions] = useState(existing?.preconditions || "");
  const [priority, setPriority] = useState(existing?.priority || "medium");
  const [type, setType] = useState(existing?.type || "functional");
  const [tags, setTags] = useState(existing?.tags || "");
  const [automated, setAutomated] = useState(existing?.automated || false);
  const [automationId, setAutomationId] = useState(existing?.automationId || "");
  const [steps, setSteps] = useState<Step[]>(
    existing?.steps ? JSON.parse(existing.steps) : [{ step: "", expected: "" }]
  );
  const [loading, setLoading] = useState(false);

  function updateStep(idx: number, field: keyof Step, value: string) {
    setSteps((s) => s.map((st, i) => (i === idx ? { ...st, [field]: value } : st)));
  }

  function addStep() {
    setSteps((s) => [...s, { step: "", expected: "" }]);
  }

  function removeStep(idx: number) {
    setSteps((s) => s.filter((_, i) => i !== idx));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const payload = {
      title,
      preconditions,
      priority,
      type,
      tags,
      automated,
      automationId,
      steps: steps.filter((s) => s.step.trim() || s.expected.trim()),
    };
    const res = existing
      ? await fetch(`/api/cases/${existing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch(`/api/suites/${suiteId}/cases`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
    setLoading(false);
    if (res.ok) {
      const c = await res.json();
      onSaved(suiteId, c, !existing);
    }
  }

  return (
    <Modal
      onClose={onClose}
      size="lg"
      title={existing ? "Editar caso de prueba" : "Nuevo caso de prueba"}
    >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <Label>Título</Label>
            <Input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <Label>
              Precondiciones
            </Label>
            <Textarea
              value={preconditions}
              onChange={(e) => setPreconditions(e.target.value)}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Prioridad</Label>
              <Select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                <option value="low">Baja</option>
                <option value="medium">Media</option>
                <option value="high">Alta</option>
                <option value="critical">Crítica</option>
              </Select>
            </div>
            <div>
              <Label>Tipo</Label>
              <Select
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="functional">Funcional</option>
                <option value="regression">Regresión</option>
                <option value="smoke">Smoke</option>
                <option value="e2e">E2E</option>
                <option value="api">API</option>
                <option value="other">Otro</option>
              </Select>
            </div>
            <div>
              <Label>
                Tags (coma)
              </Label>
              <Input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="mb-0">
                Pasos y resultado esperado
              </Label>
              <Button variant="soft" size="xs" icon={Plus} onClick={addStep}>
                Agregar paso
              </Button>
            </div>
            <div className="space-y-2">
              {steps.map((s, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <span className="text-xs text-slate-400 mt-2.5 w-4 tabular-nums">{i + 1}.</span>
                  <Textarea
                    placeholder="Paso"
                    value={s.step}
                    onChange={(e) => updateStep(i, "step", e.target.value)}
                    rows={1}
                    className="flex-1"
                  />
                  <Textarea
                    placeholder="Resultado esperado"
                    value={s.expected}
                    onChange={(e) => updateStep(i, "expected", e.target.value)}
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

          <div className="flex items-center gap-4 border-t border-slate-100 pt-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded accent-brand-600"
                checked={automated}
                onChange={(e) => setAutomated(e.target.checked)}
              />
              Caso automatizado (Playwright)
            </label>
            {automated && (
              <Input
                placeholder="ID/título del test en Playwright"
                value={automationId}
                onChange={(e) => setAutomationId(e.target.value)}
                className="flex-1 h-8"
              />
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              type="button"
              onClick={onClose}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              loading={loading}
            >
              Guardar
            </Button>
          </div>
        </form>
    </Modal>
  );
}

type ImportSummary = {
  created: number;
  updated: number;
  skipped: { title: string; reason: string }[];
};

function downloadTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "plantilla-casos-de-prueba.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function ImportCsvModal({
  suiteId,
  onClose,
  onImported,
}: {
  suiteId: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [parsedCount, setParsedCount] = useState(0);
  const [parsedCases, setParsedCases] = useState<ReturnType<typeof rowsToCases>>([]);
  const [parseError, setParseError] = useState("");
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  function applyRows(rows: string[][]) {
    const cases = rowsToCases(rows);
    if (cases.length === 0) {
      setParseError(
        "No se encontraron filas con título. Revisá que la primera fila tenga los encabezados (titulo, prioridad, tipo...) y usá la plantilla si hace falta."
      );
    }
    setParsedCases(cases);
    setParsedCount(cases.length);
  }

  function handleFile(file: File) {
    setFileName(file.name);
    setSummary(null);
    setParseError("");
    const isExcel = /\.xlsx?$/i.test(file.name);

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const XLSX = await import("xlsx");
          const data = new Uint8Array(reader.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows: string[][] = XLSX.utils
            .sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "" })
            .map((row) => row.map((cell) => String(cell ?? "")));
          applyRows(rows);
        } catch {
          setParseError("No se pudo leer el archivo Excel. Verificá que sea un .xlsx válido.");
        }
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      applyRows(parseCsv(text));
    };
    reader.readAsText(file, "utf-8");
  }

  async function handleImport() {
    if (parsedCases.length === 0) return;
    setLoading(true);
    const res = await fetch(`/api/suites/${suiteId}/cases/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cases: parsedCases }),
    });
    setLoading(false);
    if (res.ok) {
      const data: ImportSummary = await res.json();
      setSummary(data);
      onImported();
    } else {
      const data = await res.json().catch(() => ({}));
      setParseError(data.error || "No se pudo importar el archivo.");
    }
  }

  return (
    <Modal
      onClose={onClose}
      title="Importar casos desde CSV o Excel"
      description="Se importan a la suite seleccionada. Si un caso con el mismo título ya existe en esta suite, se actualiza en lugar de duplicarse."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {summary ? "Cerrar" : "Cancelar"}
          </Button>
          {!summary && (
            <Button
              icon={Upload}
              disabled={parsedCases.length === 0}
              loading={loading}
              onClick={handleImport}
            >
              {`Importar ${parsedCount || ""} caso${parsedCount === 1 ? "" : "s"}`}
            </Button>
          )}
        </>
      }
    >

        {!summary && (
          <>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) handleFile(file);
              }}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/30"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                {fileName ? <FileText size={18} aria-hidden /> : <Upload size={18} aria-hidden />}
              </div>
              <p className="text-sm text-slate-600">
                {fileName ? (
                  <span className="font-medium">{fileName}</span>
                ) : (
                  "Arrastrá un archivo .csv o .xlsx acá o hacé clic para elegirlo"
                )}
              </p>
              {parsedCount > 0 && (
                <p className="text-xs text-brand-700 mt-2">
                  {parsedCount} caso{parsedCount === 1 ? "" : "s"} listo{parsedCount === 1 ? "" : "s"}{" "}
                  para importar
                </p>
              )}
            </div>

            {parseError && <p className="text-sm text-red-600 mt-2">{parseError}</p>}

            <div className="text-xs text-slate-500 mt-3 space-y-1">
              <p>
                Columnas esperadas: <code>titulo</code>, <code>precondiciones</code>,{" "}
                <code>prioridad</code>, <code>tipo</code>, <code>tags</code>,{" "}
                <code>automatizado</code> (si/no), <code>id_automatizacion</code>,{" "}
                <code>pasos</code>.
              </p>
              <p>
                Para vincular con Playwright, poné en <code>id_automatizacion</code> el mismo
                título completo del test (ej: <code>Login &gt; should log in with valid credentials</code>)
                y marcá <code>automatizado</code> como sí — así los resultados de Playwright se
                asocian a ese caso en vez de crear uno nuevo.
              </p>
              <p>
                Pasos: <code>paso::resultado esperado</code>, separando varios con{" "}
                <code>|</code>.
              </p>
              <button
                type="button"
                onClick={downloadTemplate}
                className="text-brand-600 hover:underline"
              >
                Descargar plantilla de ejemplo
              </button>
            </div>
          </>
        )}

        {summary && (
          <div className="space-y-2">
            <div className="flex gap-1.5 flex-wrap">
              <Badge tone="success">
                {summary.created} creado{summary.created === 1 ? "" : "s"}
              </Badge>
              <Badge tone="info">
                {summary.updated} actualizado{summary.updated === 1 ? "" : "s"}
              </Badge>
              <Badge tone={summary.skipped.length ? "warning" : "neutral"}>
                {summary.skipped.length} omitido{summary.skipped.length === 1 ? "" : "s"}
              </Badge>
            </div>
            {summary.skipped.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 max-h-40 overflow-y-auto">
                {summary.skipped.map((s, i) => (
                  <p key={i} className="text-xs text-amber-800">
                    <span className="font-medium">{s.title}:</span> {s.reason}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

    </Modal>
  );
}
