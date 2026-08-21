import { db } from "@/db";
import { apiKeys, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import ApiKeysManager from "@/components/ApiKeysManager";

export default async function SettingsPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const keys = await db.query.apiKeys.findMany({ where: eq(apiKeys.projectId, id) });
  const allUsers = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users);

  return (
    <div className="space-y-10">
      <ApiKeysManager projectId={id} initialKeys={keys} />

      <div>
        <h3 className="text-sm font-medium text-slate-700 mb-3">Usuarios del sistema</h3>
        <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
          {allUsers.map((u) => (
            <div key={u.id} className="flex items-center justify-between p-3 text-sm">
              <div>
                <span className="text-slate-900 font-medium">{u.name}</span>{" "}
                <span className="text-slate-400">{u.email}</span>
              </div>
              <span className="text-xs uppercase text-slate-500">{u.role}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-2">
          Cualquier usuario registrado puede ver y trabajar en todos los proyectos por ahora
          (modelo simple de equipo). Los roles admin/lead pueden gestionar proyectos y defectos.
        </p>
      </div>
    </div>
  );
}
