import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  apiKeys,
  testRuns,
  testRunCases,
  testSuites,
  testCases,
  attachments,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";

// Playwright integration endpoint.
// Auth: header "x-api-key: tm_xxx" (create one in Project > Settings > API Keys)
//
// Body shape:
// {
//   "runName": "Regression Run #15",          // optional
//   "results": [
//     {
//       "automationId": "LoginTest",           // matches a test case's automationId, or created automatically
//       "title": "should log in with valid credentials",
//       "status": "passed" | "failed" | "skipped",
//       "durationMs": 1234,
//       "errorMessage": "...",                 // optional, for failed tests
//       "screenshotBase64": "..."               // optional, PNG base64
//     }
//   ]
// }
export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) {
    return NextResponse.json({ error: "Falta el header x-api-key" }, { status: 401 });
  }

  const keyRecord = await db.query.apiKeys.findFirst({ where: eq(apiKeys.key, apiKey) });
  if (!keyRecord) {
    return NextResponse.json({ error: "API key inválida" }, { status: 401 });
  }

  const body = await req.json();
  const results: Array<{
    automationId: string;
    title?: string;
    status: "passed" | "failed" | "skipped";
    durationMs?: number;
    errorMessage?: string;
    screenshotBase64?: string;
  }> = body.results || [];

  if (!Array.isArray(results) || results.length === 0) {
    return NextResponse.json({ error: "results vacío" }, { status: 400 });
  }

  // Ensure there's a suite to hold auto-discovered automated cases.
  let autoSuite = await db.query.testSuites.findFirst({
    where: and(
      eq(testSuites.projectId, keyRecord.projectId),
      eq(testSuites.name, "Automatizado (Playwright)")
    ),
  });
  if (!autoSuite) {
    [autoSuite] = await db
      .insert(testSuites)
      .values({
        projectId: keyRecord.projectId,
        name: "Automatizado (Playwright)",
        description: "Casos descubiertos automáticamente desde resultados de Playwright.",
      })
      .returning();
  }

  const [run] = await db
    .insert(testRuns)
    .values({
      projectId: keyRecord.projectId,
      name: body.runName || `Playwright Run · ${new Date().toLocaleString("es-CR")}`,
      source: "playwright",
      status: "completed",
      completedAt: new Date().toISOString(),
    })
    .returning();

  const created = [];
  for (const r of results) {
    let testCase = await db.query.testCases.findFirst({
      where: and(
        eq(testCases.automationId, r.automationId),
      ),
    });

    if (!testCase) {
      [testCase] = await db
        .insert(testCases)
        .values({
          suiteId: autoSuite.id,
          title: r.title || r.automationId,
          steps: "[]",
          automated: true,
          automationId: r.automationId,
        })
        .returning();
    }

    const [runCase] = await db
      .insert(testRunCases)
      .values({
        runId: run.id,
        caseId: testCase.id,
        status: r.status,
        executedAt: new Date().toISOString(),
        durationMs: r.durationMs || null,
        errorMessage: r.errorMessage || null,
        comment: "Resultado enviado automáticamente por Playwright",
      })
      .returning();

    if (r.screenshotBase64) {
      try {
        await db.insert(attachments).values({
          runCaseId: runCase.id,
          filename: `${r.automationId}.png`,
          data: r.screenshotBase64,
          mimeType: "image/png",
        });
      } catch {
        // ignore attachment errors, don't fail the whole ingest
      }
    }

    created.push({ automationId: r.automationId, status: r.status, runCaseId: runCase.id });
  }

  return NextResponse.json({ runId: run.id, results: created }, { status: 201 });
}
