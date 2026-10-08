import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { notificationSubscriptions, projects } from "@/db/schema";
import { requireUser } from "@/lib/require-auth";
import { isEmailEnabled } from "@/lib/email";
import { and, eq } from "drizzle-orm";

// The signed-in person's email notifications for this project.

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  const sub = await db.query.notificationSubscriptions.findFirst({
    where: and(eq(notificationSubscriptions.projectId, id), eq(notificationSubscriptions.userId, user!.id)),
  });
  return NextResponse.json({
    emailEnabled: isEmailEnabled(),
    email: user!.email,
    runFailed: sub?.runFailed ?? false,
    defectMinSeverity: sub?.defectMinSeverity ?? null,
  });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  const project = await db.query.projects.findFirst({ where: eq(projects.id, id), columns: { id: true } });
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const runFailed = body.runFailed === true;
  const defectMinSeverity =
    body.defectMinSeverity === "high" || body.defectMinSeverity === "critical" ? body.defectMinSeverity : null;

  await db
    .insert(notificationSubscriptions)
    .values({ projectId: id, userId: user!.id, runFailed, defectMinSeverity })
    .onConflictDoUpdate({
      target: [notificationSubscriptions.projectId, notificationSubscriptions.userId],
      set: { runFailed, defectMinSeverity },
    });
  return NextResponse.json({ runFailed, defectMinSeverity });
}
