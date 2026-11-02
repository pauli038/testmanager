import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/require-auth";
import { storageEnabled } from "@/lib/storage";
import {
  migrateOne,
  migrationSummary,
  pendingIds,
  type MigrationResult,
} from "@/lib/attachment-migration";

// Each call works for a few seconds and returns where it stopped; the admin
// page keeps calling until `done`, so no request hits the host's time limit.
export const maxDuration = 60;
const TIME_BUDGET_MS = 20_000;

async function requireAdmin() {
  const { user, error } = await requireUser();
  if (error) return error;
  if (user!.role !== "admin") {
    return NextResponse.json({ error: "Solo un admin puede migrar las evidencias" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json({ storageEnabled: storageEnabled(), summary: await migrationSummary() });
}

// Body: { step: "copy" | "clear", after?: string } — `after` is the cursor
// returned by the previous call.
export async function POST(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!storageEnabled()) {
    return NextResponse.json(
      { error: "Falta configurar SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY" },
      { status: 400 }
    );
  }
  const body = await req.json();
  const step = body.step === "clear" ? "clear" : body.step === "copy" ? "copy" : null;
  if (!step) return NextResponse.json({ error: "Paso inválido" }, { status: 400 });

  const started = Date.now();
  let after = typeof body.after === "string" ? body.after : "";
  let done = false;
  const results: MigrationResult[] = [];
  while (Date.now() - started < TIME_BUDGET_MS) {
    const [id] = await pendingIds(step, after, 1);
    if (!id) {
      done = true;
      break;
    }
    after = id;
    const r = await migrateOne(step, id);
    if (r) results.push(r);
  }

  return NextResponse.json({ results, after, done, summary: await migrationSummary() });
}
