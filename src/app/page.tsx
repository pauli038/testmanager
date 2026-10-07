import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { testRuns, testCases, testSuites } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import Link from "next/link";
import NewProjectButton from "@/components/NewProjectButton";
import EditProjectButton from "@/components/EditProjectButton";
import { canManageProject } from "@/lib/permissions";
import { FlaskConical, FolderPlus, PlayCircle } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const canEdit = canManageProject(session.user.role);

  const projects = await db.query.projects.findMany({
    orderBy: (p, { desc }) => [desc(p.createdAt)],
    with: { creator: true },
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

  return (
    <div className="w-full px-4 sm:px-8 py-10">
      <PageHeader
        title="Proyectos"
        description="Organiza tus casos de prueba, ejecuciones y defectos por proyecto."
        actions={<NewProjectButton />}
        className="mb-8"
      />

      {projects.length === 0 ? (
        <EmptyState
          icon={FolderPlus}
          title="Aún no tienes proyectos"
          description="Crea tu primer proyecto para empezar a organizar casos de prueba, runs y defectos."
          className="py-20"
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => {
            const s = stats.find((x) => x.projectId === p.id);
            return (
              <div key={p.id} className="relative">
                <Link
                  href={`/projects/${p.id}`}
                  className="group flex flex-col h-full bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-brand-300 transition"
                >
                  <h2 className={`font-semibold text-slate-900 group-hover:text-brand-700 transition-colors ${canEdit ? "pr-8" : ""}`}>
                    {p.name}
                  </h2>
                  <p className="text-sm text-slate-500 mt-1 line-clamp-2">
                    {p.description || "Sin descripción"}
                  </p>
                  <div className="flex gap-4 mt-auto pt-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <FlaskConical size={14} className="text-slate-400" aria-hidden />
                      <span className="font-medium text-slate-700 tabular-nums">{s?.cases ?? 0}</span> casos
                    </span>
                    <span className="flex items-center gap-1.5">
                      <PlayCircle size={14} className="text-slate-400" aria-hidden />
                      <span className="font-medium text-slate-700 tabular-nums">{s?.runs ?? 0}</span> runs
                    </span>
                  </div>
                  {p.creator?.name && (
                    <p className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-100">
                      Creado por {p.creator.name}
                    </p>
                  )}
                </Link>
                {canEdit && (
                  <div className="absolute top-3 right-3">
                    <EditProjectButton
                      project={{ id: p.id, name: p.name, description: p.description }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
