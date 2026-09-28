import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { eq } from "drizzle-orm";
import ApiKeysManager from "@/components/ApiKeysManager";
import Link from "next/link";

export default async function SettingsPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const keys = await db.query.apiKeys.findMany({ where: eq(apiKeys.projectId, id) });

  return (
    <div className="space-y-10">
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
    </div>
  );
}
