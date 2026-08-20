import { db } from "@/db";
import { testPlans } from "@/db/schema";
import { eq } from "drizzle-orm";
import PlansList from "@/components/PlansList";

export default async function PlansPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const plans = await db.query.testPlans.findMany({
    where: eq(testPlans.projectId, id),
    orderBy: (p, { desc }) => [desc(p.createdAt)],
  });
  return <PlansList projectId={id} initialPlans={plans} />;
}
