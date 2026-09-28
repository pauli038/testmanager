import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { asc } from "drizzle-orm";
import UsersManager from "@/components/UsersManager";

export default async function UsersPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const allUsers = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, createdAt: users.createdAt })
    .from(users)
    .orderBy(asc(users.name));

  return (
    <div className="w-full px-4 sm:px-8 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Usuarios</h1>
        <p className="text-sm text-slate-500 mt-1">
          Todos los usuarios registrados pueden ver y trabajar en todos los proyectos. Los roles
          admin y lead pueden gestionar proyectos y defectos.
        </p>
      </div>
      <UsersManager
        initialUsers={allUsers}
        currentUserId={session.user.id}
        isAdmin={session.user.role === "admin"}
      />
    </div>
  );
}
