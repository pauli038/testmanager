import { loadProjectCases } from "@/lib/project-cases";
import RunsList from "@/components/RunsList";

export default async function RunsPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { suites, casesBySuite } = await loadProjectCases(id);

  return (
    <RunsList projectId={id} suites={suites} casesBySuite={casesBySuite} />
  );
}
