import { loadProjectCases } from "@/lib/project-cases";
import RunExecution from "@/components/RunExecution";

export default async function RunPage(props: {
  params: Promise<{ id: string; runId: string }>;
}) {
  const { id, runId } = await props.params;
  const { suites, casesBySuite } = await loadProjectCases(id);
  return <RunExecution projectId={id} runId={runId} suites={suites} casesBySuite={casesBySuite} />;
}
