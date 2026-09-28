import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users, passwordResetTokens } from "@/db/schema";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { hashToken } from "@/lib/password-reset";

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(6),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "La contraseña debe tener al menos 6 caracteres" },
      { status: 400 }
    );
  }
  const { token, password } = parsed.data;
  const now = new Date().toISOString();

  // Mark the token as used atomically so it can only be redeemed once.
  const [row] = await db
    .update(passwordResetTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(passwordResetTokens.tokenHash, hashToken(token)),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, now)
      )
    )
    .returning();

  if (!row) {
    return NextResponse.json(
      { error: "El enlace no es válido o ya expiró. Solicita uno nuevo." },
      { status: 400 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await db.update(users).set({ passwordHash }).where(eq(users.id, row.userId));

  return NextResponse.json({ ok: true });
}
