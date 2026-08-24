"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ConfirmModal from "./ConfirmModal";

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

const priorityColors: Record<string, string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const lastStatusConfig: Record<string, { icon: string; classes: string; label: string }> = {
  passed: { icon: "✅", classes: "bg-emerald-100 text-emerald-700", label: "Aprobado" },
  failed: { icon: "❌", classes: "bg-red-100 text-red-700", label: "Fallido" },
  blocked: { icon: "🚫", classes: "bg-orange-100 text-orange-700", label: "Bloqueado" },
  skipped: { icon: "⏭️", classes: "bg-slate-100 text-slate-500", label: "Omitido" },
};

export default function SuitesExplorer({
  projectId,
  initialSuites,
  initialCases,
}: {
  projectId: string;
  initialSuites: Suite[];
  initialCases: Record<string, TestCase[]>;
}) {
  const router = useRouter();
  const [suites, setSuites] = useState(initialSuites);
  const [casesBySuite, setCasesBySuite] = useState(initialCases);
  const [selectedSuite, setSelectedSuite] = useState<string | null>(
    initialSuites[0]?.id || null
  );
  const [newSuiteName, setNewSuiteName] = useState("");
  const [showCaseModal, setShowCaseModal] = useState(false);
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <div className="lg:col-span-1">
        <h3 className="text-sm font-medium text-slate-700 mb-2">Suites</h3>
        <form onSubmit={createSuite} className="flex gap-2 mb-3">
          <input
            value={newSuiteName}
            onChange={(e) => setNewSuiteName(e.target.value)}
            placeholder="Nueva suite..."
            className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <button className="rounded-lg bg-teal-600 text-white px-3 text-sm hover:bg-teal-700">
            +
          </button>
        </form>
        <ul className="space-y-1">
          {suites.map((s) => (
            <li key={s.id}>
              <div
                className={`group flex items-center justify-between rounded-lg px-3 py-2 text-sm cursor-pointer ${
                  selectedSuite === s.id
                    ? "bg-teal-50 text-teal-700"
                    : "hover:bg-slate-100 text-slate-700"
                }`}
                onClick={() => setSelectedSuite(s.id)}
              >
                <span>
                  📁 {s.name}{" "}
                  <span className="text-xs text-slate-400">
                    ({casesBySuite[s.id]?.length ?? 0})
                  </span>
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setPendingDeleteSuite(s.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 text-xs"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
          {suites.length === 0 && (
            <p className="text-xs text-slate-400">Crea tu primera suite arriba.</p>
          )}
        </ul>
      </div>

      <div className="lg:col-span-3">
        {selectedSuite ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-slate-700">
                Casos de prueba
              </h3>
              <button
                onClick={openNewCase}
                className="rounded-lg bg-teal-600 text-white text-sm font-medium px-3 py-1.5 hover:bg-teal-700"
              >
                + Nuevo caso
              </button>
            </div>
            <div className="space-y-2">
              {currentCases.map((c) => (
                <div
                  key={c.id}
                  className={`bg-white border rounded-lg p-4 hover:border-teal-300 ${
                    c.lastStatus === "passed"
                      ? "border-l-4 border-l-emerald-500 border-slate-200"
                      : c.lastStatus === "failed"
                      ? "border-l-4 border-l-red-500 border-slate-200"
                      : "border-slate-200"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-slate-900 text-sm">
                          {c.title}
                        </h4>
                        {c.automated && (
                          <span className="text-xs bg-purple-100 text-purple-700 rounded px-1.5 py-0.5">
                            🤖 automatizado
                          </span>
                        )}
                        {c.lastStatus && lastStatusConfig[c.lastStatus] && (
                          <span
                            className={`text-xs rounded px-1.5 py-0.5 ${lastStatusConfig[c.lastStatus].classes}`}
                          >
                            {lastStatusConfig[c.lastStatus].icon} {lastStatusConfig[c.lastStatus].label}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2 mt-2">
                        <span
                          className={`text-xs rounded px-1.5 py-0.5 ${priorityColors[c.priority]}`}
                        >
                          {c.priority}
                        </span>
                        <span className="text-xs bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">
                          {c.type}
                        </span>
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
                    <div className="flex gap-3 text-xs">
                      <button
                        onClick={() => openViewCase(c)}
                        className="text-slate-600 hover:underline"
                      >
                        Ver
                      </button>
                      <button
                        onClick={() => openEditCase(c)}
                        className="text-teal-600 hover:underline"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => setPendingDeleteCase({ caseId: c.id, suiteId: c.suiteId })}
                        className="text-red-600 hover:underline"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {currentCases.length === 0 && (
                <p className="text-sm text-slate-400 py-10 text-center border border-dashed border-slate-300 rounded-xl">
                  No hay casos en esta suite todavía.
                </p>
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

const priorityLabels: Record<string, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  critical: "Crítica",
};

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
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">{testCase.title}</h2>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            {testCase.automated && (
              <span className="text-xs bg-purple-100 text-purple-700 rounded px-1.5 py-0.5 whitespace-nowrap">
                🤖 automatizado
              </span>
            )}
            {testCase.lastStatus && lastStatusConfig[testCase.lastStatus] && (
              <span
                className={`text-xs rounded px-1.5 py-0.5 whitespace-nowrap ${
                  lastStatusConfig[testCase.lastStatus].classes
                }`}
              >
                {lastStatusConfig[testCase.lastStatus].icon} {lastStatusConfig[testCase.lastStatus].label}
              </span>
            )}
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <span
            className={`text-xs rounded px-1.5 py-0.5 ${priorityColors[testCase.priority]}`}
          >
            {priorityLabels[testCase.priority] || testCase.priority}
          </span>
          <span className="text-xs bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">
            {typeLabels[testCase.type] || testCase.type}
          </span>
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
                  <span className="text-xs text-slate-400 mt-0.5 w-4">{i + 1}.</span>
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
            <p className="text-sm text-slate-600">{testCase.automationId}</p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            onClick={onClose}
            className="text-sm text-slate-600 px-4 py-2 hover:text-slate-900"
          >
            Cerrar
          </button>
          <button
            onClick={onEdit}
            className="rounded-lg bg-teal-600 text-white text-sm font-medium px-4 py-2 hover:bg-teal-700"
          >
            Editar
          </button>
        </div>
      </div>
    </div>
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
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          {existing ? "Editar caso de prueba" : "Nuevo caso de prueba"}
        </h2>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-700 mb-1">Título</label>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-700 mb-1">
              Precondiciones
            </label>
            <textarea
              value={preconditions}
              onChange={(e) => setPreconditions(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm text-slate-700 mb-1">Prioridad</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
              >
                <option value="low">Baja</option>
                <option value="medium">Media</option>
                <option value="high">Alta</option>
                <option value="critical">Crítica</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-700 mb-1">Tipo</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
              >
                <option value="functional">Funcional</option>
                <option value="regression">Regresión</option>
                <option value="smoke">Smoke</option>
                <option value="e2e">E2E</option>
                <option value="api">API</option>
                <option value="other">Otro</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-700 mb-1">
                Tags (coma)
              </label>
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm text-slate-700">
                Pasos y resultado esperado
              </label>
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
                    placeholder="Paso"
                    value={s.step}
                    onChange={(e) => updateStep(i, "step", e.target.value)}
                    rows={1}
                    className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <textarea
                    placeholder="Resultado esperado"
                    value={s.expected}
                    onChange={(e) => updateStep(i, "expected", e.target.value)}
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

          <div className="flex items-center gap-4 border-t border-slate-100 pt-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={automated}
                onChange={(e) => setAutomated(e.target.checked)}
              />
              Caso automatizado (Playwright)
            </label>
            {automated && (
              <input
                placeholder="ID/título del test en Playwright"
                value={automationId}
                onChange={(e) => setAutomationId(e.target.value)}
                className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-slate-600 px-4 py-2 hover:text-slate-900"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-teal-600 text-white text-sm font-medium px-4 py-2 hover:bg-teal-700 disabled:opacity-50"
            >
              {loading ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
