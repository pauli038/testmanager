import RunExecution from "@/components/RunExecution";

export default async function RunPage(props: {
  params: Promise<{ id: string; runId: string }>;
}) {
  const { id, runId } = await props.params;
  return <RunExecution projectId={id} runId={runId} />;
}
