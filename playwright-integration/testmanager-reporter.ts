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
 *        use: {
 *          // Para que los fallos lleguen con video y trace al Test Manager:
 *          video: 'retain-on-failure',
 *          trace: 'retain-on-failure',
 *          screenshot: 'only-on-failure',
 *        },
 *      } satisfies PlaywrightTestConfig;
 *
 * 3. Genera una API key en tu Test Manager: Proyecto > Ajustes > API Keys.
 *    Usa la API key del proyecto al que pertenecen estas pruebas: si usas la
 *    de otro proyecto, los resultados aparecerán allá (el Test Manager avisa
 *    en la consola cuando parece que pasó eso).
 * 4. Define las variables de entorno TESTMANAGER_URL y TESTMANAGER_API_KEY
 *    (o pásalas directo en la config, como en el ejemplo).
 *
 * OPCIONES
 *   uploadVideos      (true)  sube el video de los tests que fallan
 *   uploadTraces      (true)  sube el trace (.zip) de los tests que fallan;
 *                             se abre en https://trace.playwright.dev
 *   maxAttachmentMB   (50)    archivos más grandes no se suben
 *   ci                (auto)  { url, branch, commit } del build de CI. Si no lo
 *                             pasas, se detecta en GitHub Actions, GitLab CI,
 *                             Azure DevOps, Jenkins y Bitbucket, o se lee de
 *                             TESTMANAGER_CI_URL / _BRANCH / _COMMIT.
 *
 * VINCULAR TUS TESTS A CASOS DE PRUEBA EXISTENTES
 * El "automationId" que se manda es el título completo del test de Playwright
 * (incluyendo describe blocks, ej: "Login > should log in with valid credentials").
 * Si en tu Test Manager creas un caso de prueba y le pones ese mismo texto en el
 * campo "ID/título del test en Playwright" (automationId), los resultados se
 * asociarán a ese caso ya existente.
 *
 * Si no hay coincidencia exacta, el Test Manager también vincula el test a un caso:
 *   - por código: si el título del test incluye el código del caso (ej.
 *     "TC-RF020-06"), o un código que el caso tiene en sus etiquetas;
 *   - por título: si un caso aún sin automationId tiene el mismo título,
 *     ignorando mayúsculas, tildes, puntuación y códigos.
 * Si nada coincide, el caso se crea automáticamente dentro de una suite llamada
 * "Automatizado (Playwright)".
 *
 * Varios resultados que caen en el mismo caso dentro de un run (por ejemplo un
 * test parametrizado) se guardan como un solo resultado: el peor, con el error
 * de cada variante.
 */
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";

type CiInfo = { url?: string; branch?: string; commit?: string };

type ReporterOptions = {
  url: string;
  apiKey: string;
  runName?: string;
  uploadVideos?: boolean;
  uploadTraces?: boolean;
  maxAttachmentMB?: number;
  ci?: CiInfo;
};

type IngestResult = {
  automationId: string;
  title: string;
  status: "passed" | "failed" | "skipped";
  durationMs: number;
  errorMessage?: string;
  screenshotBase64?: string;
};

type PendingFile = { path: string; name: string; contentType: string };

const CHUNK_BYTES = 2 * 1024 * 1024; // same size the web app uses

// Build info from the usual CI environment variables.
function detectCi(env: NodeJS.ProcessEnv = process.env): CiInfo {
  if (env.TESTMANAGER_CI_URL || env.TESTMANAGER_CI_BRANCH || env.TESTMANAGER_CI_COMMIT) {
    return {
      url: env.TESTMANAGER_CI_URL,
      branch: env.TESTMANAGER_CI_BRANCH,
      commit: env.TESTMANAGER_CI_COMMIT,
    };
  }
  if (env.GITHUB_ACTIONS) {
    return {
      url: `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,
      branch: env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME,
      commit: env.GITHUB_SHA,
    };
  }
  if (env.GITLAB_CI) {
    return {
      url: env.CI_PIPELINE_URL || env.CI_JOB_URL,
      branch: env.CI_COMMIT_REF_NAME,
      commit: env.CI_COMMIT_SHA,
    };
  }
  if (env.TF_BUILD) {
    return {
      url:
        env.SYSTEM_COLLECTIONURI && env.SYSTEM_TEAMPROJECT && env.BUILD_BUILDID
          ? `${env.SYSTEM_COLLECTIONURI}${env.SYSTEM_TEAMPROJECT}/_build/results?buildId=${env.BUILD_BUILDID}`
          : undefined,
      branch: env.BUILD_SOURCEBRANCHNAME,
      commit: env.BUILD_SOURCEVERSION,
    };
  }
  if (env.JENKINS_URL) {
    return { url: env.BUILD_URL, branch: env.GIT_BRANCH || env.BRANCH_NAME, commit: env.GIT_COMMIT };
  }
  if (env.BITBUCKET_BUILD_NUMBER) {
    return {
      url: env.BITBUCKET_GIT_HTTP_ORIGIN
        ? `${env.BITBUCKET_GIT_HTTP_ORIGIN}/addon/pipelines/home#!/results/${env.BITBUCKET_BUILD_NUMBER}`
        : undefined,
      branch: env.BITBUCKET_BRANCH,
      commit: env.BITBUCKET_COMMIT,
    };
  }
  return {};
}

class TestManagerReporter implements Reporter {
  private options: ReporterOptions;
  private results: IngestResult[] = [];
  // Files to upload for each result, by its position in `results`.
  private files = new Map<number, PendingFile[]>();

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

    const index = this.results.push({
      automationId,
      title: test.title,
      status,
      durationMs: result.duration,
      errorMessage: result.error?.message,
      screenshotBase64: screenshot?.body?.toString("base64"),
    }) - 1;

    // Videos and traces are files on disk; only failures are worth the space.
    if (status === "failed") {
      const wanted = result.attachments.filter(
        (a) =>
          a.path &&
          ((a.name === "video" && this.options.uploadVideos !== false) ||
            (a.name === "trace" && this.options.uploadTraces !== false))
      );
      if (wanted.length) {
        this.files.set(
          index,
          wanted.map((a) => ({
            path: a.path!,
            name: `${a.name}-${path.basename(a.path!)}`,
            contentType: a.contentType,
          }))
        );
      }
    }
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
          ci: this.options.ci ?? detectCi(),
          results: this.results,
        }),
      });

      if (!res.ok) {
        console.error(
          `[testmanager-reporter] Error al enviar resultados: ${res.status} ${await res.text()}`
        );
        return;
      }
      const data: {
        runId: string;
        results: { runCaseId: string }[];
        warnings?: string[];
      } = await res.json();
      console.log(
        `[testmanager-reporter] ✅ ${this.results.length} resultados enviados. Run: ${data.runId}`
      );
      for (const w of data.warnings ?? []) console.warn(`[testmanager-reporter] ⚠️  ${w}`);

      await this.uploadFiles(data.results);
    } catch (err) {
      console.error("[testmanager-reporter] No se pudo conectar con Test Manager:", err);
    }
  }

  private async uploadFiles(created: { runCaseId: string }[]) {
    if (this.files.size === 0) return;
    const attachmentsUrl = this.options.url.replace(/\/?$/, "/attachments");
    const maxBytes = (this.options.maxAttachmentMB ?? 50) * 1024 * 1024;
    let uploaded = 0;
    let skipped = 0;

    for (const [index, files] of this.files) {
      const runCaseId = created[index]?.runCaseId;
      if (!runCaseId) continue;
      for (const file of files) {
        try {
          const size = (await stat(file.path)).size;
          if (size > maxBytes) {
            skipped++;
            continue;
          }
          await this.uploadInChunks(attachmentsUrl, runCaseId, file, await readFile(file.path));
          uploaded++;
        } catch (err) {
          skipped++;
          console.warn(`[testmanager-reporter] No se pudo subir ${file.name}:`, err);
        }
      }
    }
    console.log(
      `[testmanager-reporter] 📎 ${uploaded} video(s)/trace(s) subidos` +
        (skipped ? `, ${skipped} omitidos (muy grandes o con error)` : "")
    );
  }

  private async uploadInChunks(url: string, runCaseId: string, file: PendingFile, data: Buffer) {
    const totalChunks = Math.max(1, Math.ceil(data.length / CHUNK_BYTES));
    const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    for (let i = 0; i < totalChunks; i++) {
      const form = new FormData();
      form.append("runCaseId", runCaseId);
      form.append("uploadId", uploadId);
      form.append("chunkIndex", String(i));
      form.append("totalChunks", String(totalChunks));
      form.append("filename", file.name);
      form.append("mimeType", file.contentType);
      form.append("chunk", new Blob([data.subarray(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES)]));
      const res = await fetch(url, {
        method: "POST",
        headers: { "x-api-key": this.options.apiKey },
        body: form,
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    }
  }
}

export default TestManagerReporter;
