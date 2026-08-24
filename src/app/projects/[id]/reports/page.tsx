import ReportsPanel from "@/components/ReportsPanel";

export default async function ReportsPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return <ReportsPanel projectId={id} />;
}
