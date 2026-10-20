"use client";

import { useState } from "react";
import { Folder } from "lucide-react";
import { CodeBadge, SearchInput, matchesSearch } from "@/components/ui";
import type { CaseRef } from "@/lib/project-cases";

// Checkbox list of a project's cases grouped by suite, with a search box.
export default function CasePicker({
  suites,
  casesBySuite,
  selected,
  onChange,
}: {
  suites: { id: string; name: string }[];
  casesBySuite: Record<string, CaseRef[]>;
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
}) {
  const [caseQuery, setCaseQuery] = useState("");
  // Cases shown per suite: with a search, only the matching ones.
  const shownCases = (suiteId: string) =>
    (casesBySuite[suiteId] || []).filter((c) => matchesSearch(caseQuery, c.code, c.title));
  const shownSuites = (
    caseQuery.trim()
      ? suites.filter((s) => matchesSearch(caseQuery, s.name) || shownCases(s.id).length > 0)
      : suites
  ).filter((s) => (casesBySuite[s.id] || []).length > 0);

  function toggleCase(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  // Ticks/unticks the suite's cases that are on screen (all of them without a search).
  function toggleSuite(id: string) {
    const ids = shownCases(id).map((c) => c.id);
    const next = new Set(selected);
    const allSelected = ids.every((i) => next.has(i));
    ids.forEach((i) => (allSelected ? next.delete(i) : next.add(i)));
    onChange(next);
  }

  return (
    <>
      <SearchInput
        value={caseQuery}
        onChange={setCaseQuery}
        placeholder="Buscar por código, nombre o suite…"
        aria-label="Buscar casos para el run"
        className="mb-2"
      />
      {caseQuery.trim() && (
        <p className="mb-2 text-xs text-slate-500">
          La casilla de cada suite marca solo los casos que se ven con esta búsqueda.
        </p>
      )}
      <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-[26rem] overflow-y-auto">
        {shownSuites.length === 0 && (
          <p className="py-4 text-center text-xs text-slate-400">
            {caseQuery.trim()
              ? `Ningún caso coincide con “${caseQuery.trim()}”.`
              : "No hay casos disponibles."}
          </p>
        )}
        {shownSuites.map((s) => (
          <div key={s.id} className="p-2">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={shownCases(s.id).every((c) => selected.has(c.id)) && shownCases(s.id).length > 0}
                onChange={() => toggleSuite(s.id)}
              />
              <Folder size={14} className="text-slate-400" aria-hidden />
              {s.name}
              <span className="text-xs font-normal text-slate-400 tabular-nums">
                ({shownCases(s.id).length})
              </span>
            </label>
            <div className="pl-6 mt-1 space-y-1">
              {shownCases(s.id).map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggleCase(c.id)}
                  />
                  <CodeBadge code={c.code} />
                  {c.title}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
