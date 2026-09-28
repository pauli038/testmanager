import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createResetLink, isEmailEnabled, sendResetEmail } from "@/lib/password-reset";

// Always answers the same way whether or not the email exists, so this
// endpoint can't be used to find out who has an account.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.toLowerCase().trim() : "";
  const emailEnabled = isEmailEnabled();

  if (email && emailEnabled) {
    const user = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (user) {
      try {
        const link = await createResetLink(user.id, req.nextUrl.origin);
        await sendResetEmail(user.email, user.name, link);
      } catch (err) {
        console.error("No se pudo enviar el correo de recuperación:", err);
      }
    }
  }

  return NextResponse.json({ emailEnabled });
}
