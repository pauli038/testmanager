import { NextResponse } from "next/server";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

export function generateApiKey() {
  return `tm_${nanoid(32)}`;
}

// Auth for the Playwright endpoints: header "x-api-key: tm_…". Returns the
// project the key belongs to, or a 401 response.
export async function requireApiKey(
  req: Request
): Promise<{ projectId: string; error: null } | { projectId: null; error: NextResponse }> {
  const key = req.headers.get("x-api-key");
  if (!key) {
    return { projectId: null, error: NextResponse.json({ error: "Falta el header x-api-key" }, { status: 401 }) };
  }
  const record = await db.query.apiKeys.findFirst({ where: eq(apiKeys.key, key) });
  if (!record) {
    return { projectId: null, error: NextResponse.json({ error: "API key inválida" }, { status: 401 }) };
  }
  return { projectId: record.projectId, error: null };
}
