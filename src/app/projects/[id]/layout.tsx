import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import ProjectTabs from "@/components/ProjectTabs";

export default async function ProjectLayout(props: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await props.params;
  const project = await db.query.projects.findFirst({ where: eq(projects.id, id) });
  if (!project) notFound();

  return (
    <div>
      <div className="bg-white border-b border-slate-100">
        <div className="w-full px-4 sm:px-8 pt-6 pb-2">
          <h1 className="text-xl font-semibold text-slate-900">{project.name}</h1>
          {project.description && (
            <p className="text-sm text-slate-500 mt-1">{project.description}</p>
          )}
        </div>
      </div>
      <ProjectTabs projectId={id} />
      <div className="w-full px-4 sm:px-8 py-8">{props.children}</div>
    </div>
  );
}