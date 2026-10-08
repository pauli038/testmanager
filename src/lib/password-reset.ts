import crypto from "crypto";
import { db } from "@/db";
import { passwordResetTokens } from "@/db/schema";
import { escapeHtml, isEmailEnabled, sendEmail } from "@/lib/email";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hora

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Creates a single-use reset token for the user and returns the link to
// /reset-password. Links are built from APP_URL when set, so emails never
// depend on the request's Host header.
export async function createResetLink(userId: string, requestOrigin: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  await db.insert(passwordResetTokens).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
  });
  const base = (process.env.APP_URL || requestOrigin).replace(/\/$/, "");
  return `${base}/reset-password?token=${token}`;
}

export { isEmailEnabled };

export async function sendResetEmail(to: string, name: string, link: string) {
  await sendEmail({
    to,
    subject: "Restablecer tu contraseña de Test Manager",
    html: `<p>Hola ${escapeHtml(name)},</p>
<p>Recibimos una solicitud para restablecer tu contraseña. Haz clic en el enlace para crear una nueva (válido por 1 hora):</p>
<p><a href="${link}">${link}</a></p>
<p>Si no la solicitaste, puedes ignorar este correo.</p>`,
  });
}
