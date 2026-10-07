import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { testRunCases, testRuns } from "@/db/schema";
import { requireApiKey } from "@/lib/api-key";
import { receiveRunCaseChunk } from "@/lib/chunk-upload";
import { eq } from "drizzle-orm";

// Videos and traces of failed Playwright tests. Stored in the database like
// the rest of the evidence, so the reporter only sends them for failures and
// the size is capped.
const MAX_BYTES = 50 * 1024 * 1024; // 50MB

// Uploads one chunk of a file for a result created by POST /api/ingest.
// Auth: header "x-api-key". Form fields: runCaseId (from the ingest
// response) plus chunk, uploadId, chunkIndex, totalChunks, filename, mimeType.
export async function POST(req: NextRequest) {
  const { projectId, error } = await requireApiKey(req);
  if (error) return error;

  const formData = await req.formData();
  const runCaseId = formData.get("runCaseId");
  if (typeof runCaseId !== "string" || !runCaseId) {
    return NextResponse.json({ error: "Falta runCaseId" }, { status: 400 });
  }

  // The result must belong to a run of the key's project.
  const [owner] = await db
    .select({ projectId: testRuns.projectId })
    .from(testRunCases)
    .innerJoin(testRuns, eq(testRunCases.runId, testRuns.id))
    .where(eq(testRunCases.id, runCaseId));
  if (!owner || owner.projectId !== projectId) {
    return NextResponse.json({ error: "Resultado no encontrado en este proyecto" }, { status: 404 });
  }

  return receiveRunCaseChunk(formData, runCaseId, MAX_BYTES);
}
