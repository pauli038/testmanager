"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Suite = { id: string; name: string };
type CaseRef = { id: string; title: string };
type Run = {
  id: string;
  name: string;
  status: string;
  source: string;
  createdAt: string;
  stats: Record<string, number>;
  total: number;
};

const statusColors: Record<string, string> = {
  passed: "bg-emerald-500",
  failed: "bg-red-500",
  blocked: "bg-orange-400",
  skipped: "bg-slate-400",
  untested: "bg-slate-200",
};

export default function RunsList({
  projectId,
  suites,
  casesBySuite,
}: {
  projectId: string;
  suites: Suite[];
  casesBySuite: Record<string, CaseRef[]>;
}) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`/api/projects/${projectId}/runs`)
      .then((r) => r.json())
      .then((data) => {
        setRuns(data);
        setLoading(false);
      });
  }, [projectId]);

  function toggleCase(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSuite(id: string) {
    const ids = (casesBySuite[id] || []).map((c) => c.id);
    setSelected((s) => {
      const next = new Set(s);
      const allSelected = ids.every((i) => next.has(i));
      ids.forEach((i) => (allSelected ? next.delete(i) : next.add(i)));
      return next;
    });
  }

  async function createRun(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/projects/${projectId}/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, caseIds: Array.from(selected) }),
    });
    if (res.ok) {
      window.location.href = `/projects/${projectId}/runs/${(await res.json()).id}`;
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-slate-700">Test Runs</h3>
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg bg-indigo-600 text-white text-sm font-medium px-3 py-1.5 hover:bg-indigo-700"
        >
          + Nuevo run
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Cargando...</p>
      ) : runs.length === 0 ? (
        <p className="text-sm text-slate-400 py-10 text-center border border-dashed border-slate-300 rounded-xl">
          No hay runs todavía.
        </p>
      ) : (
        <div className="space-y-2">
          {runs.map((r) => {
            const pct = r.total > 0 ? Math.round(((r.stats.passed || 0) / r.total) * 100) : 0;
            return (
              <Link
                key={r.id}
                href={`/projects/${projectId}/runs/${r.id}`}
                className="block bg-white border border-slate-200 rounded-lg p-4 hover:border-indigo-300"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-slate-900 text-sm">{r.name}</h4>
                      {r.source === "playwright" && (
                        <span className="text-xs bg-purple-100 text-purple-700 rounded px-1.5 py-0.5">
                          🤖 Playwright
                        </span>
                      )}
                      <span
                        className={`text-xs rounded px-1.5 py-0.5 ${
                          r.status === "completed"
                            ? "bg-slate-100 text-slate-600"
                            : "bg-indigo-100 text-indigo-700"
                        }`}
                      >
                        {r.status === "completed" ? "Completado" : "Activo"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {r.total} casos · {pct}% aprobado
                    </p>
                  </div>
                  <div className="flex gap-3 text-xs text-slate-600">
                    <span>✅ {r.stats.passed || 0}</span>
                    <span>❌ {r.stats.failed || 0}</span>
                    <span>⏭️ {r.stats.skipped || 0}</span>
                    <span>🚫 {r.stats.blocked || 0}</span>
                    <span>⚪ {r.stats.untested || 0}</span>
                  </div>
                </div>
                <div className="flex h-1.5 rounded-full overflow-hidden mt-3 bg-slate-100">
                  {(["passed", "failed", "blocked", "skipped"] as const).map((k) =>
                    r.stats[k] ? (
                      <div
                        key={k}
                        className={statusColors[k]}
                        style={{ width: `${(r.stats[k] / r.total) * 100}%` }}
                      />
                    ) : null
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-lg max-h-[85vh] overflow-y-auto p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Nuevo test run</h2>
            <form onSubmit={createRun} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-700 mb-1">Nombre</label>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Regresión Sprint 24"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-700 mb-2">
                  Selecciona los casos a incluir ({selected.size})
                </label>
                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-64 overflow-y-auto">
                  {suites.map((s) => (
                    <div key={s.id} className="p-2">
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(casesBySuite[s.id] || []).every((c) =>
                            selected.has(c.id)
                          ) && (casesBySuite[s.id] || []).length > 0}
                          onChange={() => toggleSuite(s.id)}
                        />
                        📁 {s.name}
                      </label>
                      <div className="pl-6 mt-1 space-y-1">
                        {(casesBySuite[s.id] || []).map((c) => (
                          <label
                            key={c.id}
                            className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={selected.has(c.id)}
                              onChange={() => toggleCase(c.id)}
                            />
                            {c.title}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-sm text-slate-600 px-4 py-2"
                >
                  Cancelar
                </button>
                <button
                  disabled={selected.size === 0}
                  className="rounded-lg bg-indigo-600 text-white text-sm font-medium px-4 py-2 hover:bg-indigo-700 disabled:opacity-50"
                >
                  Crear run
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
