import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { testRuns, testCases, testSuites } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import Link from "next/link";
import NewProjectButton from "@/components/NewProjectButton";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Proyectos</h1>
          <p className="text-sm text-slate-500 mt-1">
            Organiza tus casos de prueba, ejecuciones y defectos por proyecto.
          </p>
        </div>
        <NewProjectButton />
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-slate-300 rounded-xl">
          <p className="text-slate-500">Aún no tienes proyectos.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => {
            const s = stats.find((x) => x.projectId === p.id);
            return (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="block bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md hover:border-teal-300 transition"
              >
                <h2 className="font-medium text-slate-900">{p.name}</h2>
                <p className="text-sm text-slate-500 mt-1 line-clamp-2">
                  {p.description || "Sin descripción"}
                </p>
                <div className="flex gap-4 mt-4 text-xs text-slate-500">
                  <span>🧪 {s?.cases ?? 0} casos</span>
                  <span>▶️ {s?.runs ?? 0} runs</span>
                </div>
                {p.creator?.name && (
                  <p className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-100">
                    Creado por {p.creator.name}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
