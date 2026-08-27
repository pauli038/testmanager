"use client";

import { useState } from "react";
import SuitesExplorer from "./SuitesExplorer";
import CaseKanbanBoard, { type KanbanColumn, type KanbanCase } from "./CaseKanbanBoard";

type Suite = { id: string; name: string; description: string | null };
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

export default function CasesView({
  projectId,
  initialSuites,
  initialCases,
  initialColumns,
  initialKanbanCases,
}: {
  projectId: string;
  initialSuites: Suite[];
  initialCases: Record<string, TestCase[]>;
  initialColumns: KanbanColumn[];
  initialKanbanCases: KanbanCase[];
}) {
  const [view, setView] = useState<"suites" | "kanban">("suites");

  return (
    <div>
      <div className="flex justify-end mb-4">
        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
          <button
            onClick={() => setView("suites")}
            className={`text-sm font-medium px-3 py-1.5 ${
              view === "suites" ? "bg-slate-100 text-slate-900" : "bg-white text-slate-500 hover:bg-slate-50"
            }`}
          >
            🗂️ Por suites
          </button>
          <button
            onClick={() => setView("kanban")}
            className={`text-sm font-medium px-3 py-1.5 border-l border-slate-200 ${
              view === "kanban" ? "bg-slate-100 text-slate-900" : "bg-white text-slate-500 hover:bg-slate-50"
            }`}
          >
            🧭 Kanban QA
          </button>
        </div>
      </div>

      {view === "suites" ? (
        <SuitesExplorer projectId={projectId} initialSuites={initialSuites} initialCases={initialCases} />
      ) : (
        <CaseKanbanBoard
          projectId={projectId}
          initialColumns={initialColumns}
          initialCases={initialKanbanCases}
        />
      )}
    </div>
  );
}
