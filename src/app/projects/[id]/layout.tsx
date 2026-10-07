import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
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
      <div className="bg-white">
        <div className="w-full px-4 sm:px-8 pt-5 pb-2">
          <nav aria-label="Ruta" className="flex items-center gap-1 text-xs text-slate-500 mb-1.5">
            <Link href="/" className="hover:text-brand-700">
              Proyectos
            </Link>
            <ChevronRight size={12} className="text-slate-400" aria-hidden />
            <span className="text-slate-700 truncate">{project.name}</span>
          </nav>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">{project.name}</h1>
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