import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import TraceabilityMatrix from "@/components/TraceabilityMatrix";
import { getTraceabilityData } from "@/lib/traceability";

export default async function TraceabilityPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const [project, data] = await Promise.all([
    db.query.projects.findFirst({ where: eq(projects.id, id), columns: { name: true } }),
    getTraceabilityData(id),
  ]);
  return <TraceabilityMatrix projectId={id} projectName={project?.name ?? "proyecto"} data={data} />;
}
