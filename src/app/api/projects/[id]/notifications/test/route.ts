import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { requireUser } from "@/lib/require-auth";
import { appUrl, emailLayout, escapeHtml, isEmailEnabled, sendEmail } from "@/lib/email";
import { eq } from "drizzle-orm";

// Sends a sample notification to the signed-in person, to check that email
// works before relying on it.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  if (!isEmailEnabled()) {
    return NextResponse.json(
      { error: "El envío de correos no está configurado (faltan RESEND_API_KEY y EMAIL_FROM)." },
      { status: 400 }
    );
  }
  const to = user!.email;
  if (!to) return NextResponse.json({ error: "Tu usuario no tiene correo" }, { status: 400 });
  const project = await db.query.projects.findFirst({ where: eq(projects.id, id) });
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

  try {
    await sendEmail({
      to,
      subject: `[${project.name.trim()}] Correo de prueba de Test Manager`,
      html: emailLayout({
        title: "Las notificaciones funcionan",
        body: `<p style="margin:0;font-size:14px">Hola ${escapeHtml(user!.name ?? "")}, este es un correo de prueba de <b>${escapeHtml(project.name.trim())}</b>. Si lo recibiste, los avisos de runs con fallos y defectos nuevos te llegarán aquí.</p>`,
        action: { label: "Abrir el proyecto", url: `${appUrl(req.nextUrl.origin)}/projects/${id}` },
      }),
    });
  } catch (err) {
    console.error("[notificaciones] correo de prueba:", err);
    return NextResponse.json({ error: "Resend rechazó el envío. Revisa RESEND_API_KEY y EMAIL_FROM." }, { status: 502 });
  }
  return NextResponse.json({ ok: true, to });
}
