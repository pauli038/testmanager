import { db } from "@/db";
import { testPlans, testSuites } from "@/db/schema";
import { eq } from "drizzle-orm";
import PlansList from "@/components/PlansList";

export default async function PlansPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const plans = await db.query.testPlans.findMany({
    where: eq(testPlans.projectId, id),
    orderBy: (p, { desc }) => [desc(p.createdAt)],
    with: { planSuites: { with: { suite: true } } },
  });
  const initialPlans = plans.map(({ planSuites, ...p }) => ({
    ...p,
    suites: planSuites.map((ps) => ({ id: ps.suite.id, name: ps.suite.name })),
  }));
  const suites = await db.query.testSuites.findMany({
    where: eq(testSuites.projectId, id),
    columns: { id: true, name: true },
  });
  return <PlansList projectId={id} initialPlans={initialPlans} suites={suites} />;
}
