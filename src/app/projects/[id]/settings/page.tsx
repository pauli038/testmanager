import { db } from "@/db";
import { apiKeys, projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import ApiKeysManager from "@/components/ApiKeysManager";
import Link from "next/link";
import { notFound } from "next/navigation";
import ProjectSettings from "@/components/ProjectSettings";
import { auth } from "@/lib/auth";
import { canDeleteProject, canManageProject } from "@/lib/permissions";

export default async function SettingsPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const project = await db.query.projects.findFirst({ where: eq(projects.id, id) });
  if (!project) notFound();
  const session = await auth();
  const role = session!.user.role;
  const keys = await db.query.apiKeys.findMany({ where: eq(apiKeys.projectId, id) });

  return (
    <ProjectSettings
      project={{ id: project.id, name: project.name, description: project.description }}
      canEdit={canManageProject(role)}
      canDelete={canDeleteProject(role)}
    >
      <ApiKeysManager projectId={id} initialKeys={keys} />

      <div>
        <h3 className="text-sm font-medium text-slate-700 mb-1">Usuarios del sistema</h3>
        <p className="text-sm text-slate-500">
          Los usuarios, sus roles y el restablecimiento de contraseñas se gestionan en{" "}
          <Link href="/users" className="text-teal-600 hover:underline">
            Usuarios
          </Link>
          .
        </p>
      </div>
    </ProjectSettings>
  );
}
