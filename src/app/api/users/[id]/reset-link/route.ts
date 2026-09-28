import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/require-auth";
import { createResetLink } from "@/lib/password-reset";

// Admin-only: generates a reset link to hand to a user manually (for when
// email sending isn't configured).
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (user!.role !== "admin") {
    return NextResponse.json({ error: "Solo un admin puede hacer esto" }, { status: 403 });
  }

  const { id } = await props.params;
  const target = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!target) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const link = await createResetLink(target.id, req.nextUrl.origin);
  return NextResponse.json({ link });
}
