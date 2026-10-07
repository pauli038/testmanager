"use client";

import { useState } from "react";
import SuitesExplorer from "./SuitesExplorer";
import CaseKanbanBoard, { type KanbanColumn, type KanbanCase } from "./CaseKanbanBoard";
import { Columns3, FolderTree } from "lucide-react";
import { Segmented } from "@/components/ui";

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
  const [headerActionsEl, setHeaderActionsEl] = useState<HTMLDivElement | null>(null);

  return (
    <div>
      <div className="flex items-center justify-end gap-2 mb-4">
        <div ref={setHeaderActionsEl} className="flex gap-2" />
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "suites", label: "Por suites", icon: FolderTree },
            { value: "kanban", label: "Kanban QA", icon: Columns3 },
          ]}
        />
      </div>

      {view === "suites" ? (
        <SuitesExplorer
          projectId={projectId}
          initialSuites={initialSuites}
          initialCases={initialCases}
          headerActionsContainer={headerActionsEl}
        />
      ) : (
        <CaseKanbanBoard
          projectId={projectId}
          initialColumns={initialColumns}
          initialCases={initialKanbanCases}
          headerActionsContainer={headerActionsEl}
        />
      )}
    </div>
  );
}
