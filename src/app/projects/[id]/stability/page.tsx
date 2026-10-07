import StabilityView from "@/components/StabilityView";
import { getStabilityData } from "@/lib/stability";

export default async function StabilityPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const data = await getStabilityData(id);
  return <StabilityView projectId={id} data={data} />;
}
