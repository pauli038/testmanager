import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { testRuns, testCases, testSuites } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import NewProjectButton from "@/components/NewProjectButton";
import ProjectsDashboard, { type DashboardProject } from "@/components/ProjectsDashboard";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const projects = await db.query.projects.findMany({
    orderBy: (p, { desc }) => [desc(p.createdAt)],
    with: { creator: true, members: true },
  });

  const stats = await Promise.all(
    projects.map(async (p) => {
      const caseCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(testCases)
        .innerJoin(testSuites, eq(testCases.suiteId, testSuites.id))
        .where(eq(testSuites.projectId, p.id));

      const runCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(testRuns)
        .where(eq(testRuns.projectId, p.id));

      return {
        projectId: p.id,
        cases: Number(caseCount[0]?.count ?? 0),
        runs: Number(runCount[0]?.count ?? 0),
      };
    })
  );

  const dashboardProjects: DashboardProject[] = projects.map((p) => {
    const s = stats.find((x) => x.projectId === p.id);
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      status: p.status,
      progress: p.progress,
      creatorName: p.creator?.name ?? null,
      memberCount: p.members.length,
      cases: s?.cases ?? 0,
      runs: s?.runs ?? 0,
    };
  });

  return (
    <div className="w-full px-4 sm:px-8 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Proyectos</h1>
          <p className="text-sm text-slate-500 mt-1">
            Organiza tus casos de prueba, ejecuciones y defectos por proyecto.
          </p>
        </div>
        <NewProjectButton />
      </div>

      <ProjectsDashboard initialProjects={dashboardProjects} />
    </div>
  );
}
