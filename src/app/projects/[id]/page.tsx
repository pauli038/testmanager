import DashboardCharts from "@/components/DashboardCharts";
import { getDashboardData } from "@/lib/dashboard-data";

export default async function ProjectDashboard(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const data = await getDashboardData(id);
  return <DashboardCharts projectId={id} data={data} />;
}
