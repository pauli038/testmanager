import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/lib/require-auth";

const schema = z.object({
  role: z.enum(["admin", "lead", "tester"]),
});

// Admin-only: change a user's role. The system always keeps at least one admin.
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (user!.role !== "admin") {
    return NextResponse.json({ error: "Solo un admin puede cambiar roles" }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
  }
  const { role } = parsed.data;
  const { id } = await props.params;

  const target = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!target) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  if (target.role === "admin" && role !== "admin") {
    const otherAdmin = await db.query.users.findFirst({
      where: and(eq(users.role, "admin"), ne(users.id, id)),
    });
    if (!otherAdmin) {
      return NextResponse.json(
        { error: "Debe quedar al menos un admin en el sistema" },
        { status: 400 }
      );
    }
  }

  const [updated] = await db
    .update(users)
    .set({ role })
    .where(eq(users.id, id))
    .returning({ id: users.id, role: users.role });

  return NextResponse.json(updated);
}
