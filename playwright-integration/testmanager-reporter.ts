/**
 * Reporter personalizado para Playwright que envía automáticamente los
 * resultados de tus pruebas a tu Test Manager.
 *
 * INSTALACIÓN
 * 1. Copia este archivo a tu proyecto de Playwright, por ejemplo en:
 *      tests/testmanager-reporter.ts
 * 2. En tu playwright.config.ts, agrega el reporter:
 *
 *      import type { PlaywrightTestConfig } from '@playwright/test';
 *
 *      export default {
 *        reporter: [
 *          ['list'],
 *          ['./tests/testmanager-reporter.ts', {
 *            url: process.env.TESTMANAGER_URL || 'http://localhost:3000/api/ingest',
 *            apiKey: process.env.TESTMANAGER_API_KEY,
 *            runName: `Regression Run - ${new Date().toLocaleString()}`,
 *          }],
 *        ],
 *      } satisfies PlaywrightTestConfig;
 *
 * 3. Genera una API key en tu Test Manager: Proyecto > Ajustes > API Keys.
 * 4. Define las variables de entorno TESTMANAGER_URL y TESTMANAGER_API_KEY
 *    (o pásalas directo en la config, como en el ejemplo).
 *
 * VINCULAR TUS TESTS A CASOS DE PRUEBA EXISTENTES
 * El "automationId" que se manda es el título completo del test de Playwright
 * (incluyendo describe blocks, ej: "Login > should log in with valid credentials").
 * Si en tu Test Manager creas un caso de prueba y le pones ese mismo texto en el
 * campo "ID/título del test en Playwright" (automationId), los resultados se
 * asociarán a ese caso ya existente. Si no existe, el caso se crea automáticamente
 * dentro de una suite llamada "Automatizado (Playwright)".
 */
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";

type ReporterOptions = {
  url: string;
  apiKey: string;
  runName?: string;
};

type IngestResult = {
  automationId: string;
  title: string;
  status: "passed" | "failed" | "skipped";
  durationMs: number;
  errorMessage?: string;
  screenshotBase64?: string;
};

class TestManagerReporter implements Reporter {
  private options: ReporterOptions;
  private results: IngestResult[] = [];

  constructor(options: ReporterOptions) {
    if (!options?.url || !options?.apiKey) {
      throw new Error(
        "[testmanager-reporter] Debes configurar 'url' y 'apiKey' en playwright.config.ts"
      );
    }
    this.options = options;
  }

  onBegin(_config: FullConfig, _suite: Suite) {
    console.log(`[testmanager-reporter] Enviando resultados a ${this.options.url}`);
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const status: IngestResult["status"] =
      result.status === "passed"
        ? "passed"
        : result.status === "skipped"
        ? "skipped"
        : "failed";

    // Full title including describe blocks, e.g. "Login > logs in successfully"
    const automationId = test.titlePath().slice(1).join(" > ");

    const screenshot = result.attachments.find(
      (a) => a.contentType === "image/png" && a.body
    );

    this.results.push({
      automationId,
      title: test.title,
      status,
      durationMs: result.duration,
      errorMessage: result.error?.message,
      screenshotBase64: screenshot?.body?.toString("base64"),
    });
  }

  async onEnd(_result: FullResult) {
    if (this.results.length === 0) return;

    try {
      const res = await fetch(this.options.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.options.apiKey,
        },
        body: JSON.stringify({
          runName: this.options.runName,
          results: this.results,
        }),
      });

      if (!res.ok) {
        console.error(
          `[testmanager-reporter] Error al enviar resultados: ${res.status} ${await res.text()}`
        );
      } else {
        const data = await res.json();
        console.log(
          `[testmanager-reporter] ✅ ${this.results.length} resultados enviados. Run: ${data.runId}`
        );
      }
    } catch (err) {
      console.error("[testmanager-reporter] No se pudo conectar con Test Manager:", err);
    }
  }
}

export default TestManagerReporter;
