import { db } from "@/db";
import { apiKeys, projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import ApiKeysManager from "@/components/ApiKeysManager";
import { notFound } from "next/navigation";
import ProjectSettings from "@/components/ProjectSettings";
import NotificationSettings from "@/components/NotificationSettings";
import { auth } from "@/lib/auth";
import { canDeleteProject } from "@/lib/permissions";

export default async function SettingsPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const project = await db.query.projects.findFirst({ where: eq(projects.id, id) });
  if (!project) notFound();
  const session = await auth();
  const role = session!.user.role;
  const keys = await db.query.apiKeys.findMany({ where: eq(apiKeys.projectId, id) });

  return (
    <ProjectSettings
      project={{ id: project.id, name: project.name }}
      canDelete={canDeleteProject(role)}
    >
      <NotificationSettings projectId={id} projectName={project.name.trim()} />
      <ApiKeysManager projectId={id} initialKeys={keys} />
    </ProjectSettings>
  );
}
