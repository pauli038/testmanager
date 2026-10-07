import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects, requirements } from "@/db/schema";
import { requireUser } from "@/lib/require-auth";
import { normalizeRequirementKey } from "@/lib/requirement-key";
import { eq, sql } from "drizzle-orm";

// Loads the project's requirement list, e.g. pasted from the requirements
// document or read from an Excel file in the browser.
// Body: { items: [{ key: "RF-001", title?: "Registro de compras" }] }
// Existing keys get their title updated (when one is sent); new keys are added.
// Nothing is deleted.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { id: projectId } = await ctx.params;

  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const raw: { key?: unknown; title?: unknown }[] = Array.isArray(body?.items) ? body.items : [];

  const items = new Map<string, string | null>();
  const invalid: string[] = [];
  for (const r of raw) {
    const key = typeof r.key === "string" ? normalizeRequirementKey(r.key) : null;
    if (!key) {
      invalid.push(String(r.key ?? ""));
      continue;
    }
    const title = typeof r.title === "string" && r.title.trim() ? r.title.trim().slice(0, 300) : null;
    items.set(key, title ?? items.get(key) ?? null);
  }
  if (items.size === 0) {
    return NextResponse.json(
      { error: "No se encontró ningún requisito válido (ej. RF-001)", invalid },
      { status: 400 }
    );
  }

  const existing = new Set(
    (
      await db.query.requirements.findMany({
        where: eq(requirements.projectId, projectId),
        columns: { key: true },
      })
    ).map((r) => r.key)
  );

  await db
    .insert(requirements)
    .values([...items].map(([key, title]) => ({ projectId, key, title })))
    .onConflictDoUpdate({
      target: [requirements.projectId, requirements.key],
      // Keep the current title when the new row doesn't bring one.
      set: { title: sql`coalesce(excluded.title, ${requirements.title})` },
    });

  const created = [...items.keys()].filter((k) => !existing.has(k)).length;
  return NextResponse.json(
    { created, updated: items.size - created, invalid },
    { status: 201 }
  );
}
