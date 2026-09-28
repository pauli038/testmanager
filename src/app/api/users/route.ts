import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/lib/require-auth";
import { createResetLink } from "@/lib/password-reset";

const schema = z.object({
  name: z.string().trim().min(1),
  email: z.string().email(),
  role: z.enum(["admin", "lead", "tester"]),
});

// Admin-only: creates a user with an unusable random password and returns a
// one-time link for them to set their own (works as an invitation).
export async function POST(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (user!.role !== "admin") {
    return NextResponse.json({ error: "Solo un admin puede agregar usuarios" }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Nombre, correo y rol son requeridos" }, { status: 400 });
  }
  const { name, role } = parsed.data;
  const email = parsed.data.email.toLowerCase().trim();

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) {
    return NextResponse.json({ error: "Ya existe una cuenta con ese correo" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
  const [created] = await db
    .insert(users)
    .values({ name, email, role, passwordHash })
    .returning({ id: users.id, name: users.name, email: users.email, role: users.role, createdAt: users.createdAt });

  const link = await createResetLink(created.id, req.nextUrl.origin);
  return NextResponse.json({ user: created, link }, { status: 201 });
}
