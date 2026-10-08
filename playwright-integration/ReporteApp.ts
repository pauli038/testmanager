import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

/**
 * Reporter propio: al terminar la corrida envía los resultados a la app de reportes
 * (Test Manager). Configuración (solo en .env, nunca en el código):
 *   REPORT_URL   = endpoint que recibe los resultados (POST) — /api/ingest de Test Manager
 *   REPORT_TOKEN = API key generada en Test Manager > Proyecto > Ajustes > API Keys
 *                  (la del MISMO proyecto de estas pruebas; si es la de otro proyecto,
 *                  los resultados aparecen allá y Test Manager avisa en consola)
 * Si falta alguna de las dos, el reporter no envía nada y solo avisa en consola.
 *
 * Además de los resultados, envía:
 *   - el enlace al build de CI, la rama y el commit (detectados solos en GitHub
 *     Actions, GitLab CI, Azure DevOps, Jenkins y Bitbucket, o desde
 *     REPORT_CI_URL / REPORT_CI_BRANCH / REPORT_CI_COMMIT);
 *   - la captura, el video y el trace de los tests que fallan (los que guarda
 *     playwright.config.ts con 'only-on-failure' / 'retain-on-failure').
 *     Archivos de más de REPORT_MAX_ADJUNTO_MB (50 por defecto) no se suben.
 */
interface ResultadoCaso {
  caso: string | null; // TC-RFxxx-yy
  requerimiento: string | null; // RF-xxx
  titulo: string;
  proyecto: string;
  estado: 'aprobado' | 'fallido' | 'omitido' | 'fallo-esperado';
  duracionMs: number;
  intentos: number; // 1 = pasó o falló al primer intento
  error?: string;
  anotaciones: { tipo: string; descripcion?: string }[];
  capturaRuta?: string; // archivo .png de la captura (solo si falló)
  adjuntos: { ruta: string; nombre: string; tipo: string }[]; // video y trace
}

// Test Manager (/api/ingest) solo entiende estos tres estados.
function aEstadoTestManager(estado: ResultadoCaso['estado']): 'passed' | 'failed' | 'skipped' {
  if (estado === 'aprobado') return 'passed';
  if (estado === 'omitido') return 'skipped';
  return 'failed'; // 'fallido' y 'fallo-esperado'
}

// Datos del build de CI a partir de las variables de entorno habituales.
function detectarCi(env: NodeJS.ProcessEnv = process.env): { url?: string; branch?: string; commit?: string } {
  if (env.REPORT_CI_URL || env.REPORT_CI_BRANCH || env.REPORT_CI_COMMIT) {
    return { url: env.REPORT_CI_URL, branch: env.REPORT_CI_BRANCH, commit: env.REPORT_CI_COMMIT };
  }
  if (env.GITHUB_ACTIONS) {
    return {
      url: `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,
      branch: env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME,
      commit: env.GITHUB_SHA,
    };
  }
  if (env.GITLAB_CI) {
    return { url: env.CI_PIPELINE_URL || env.CI_JOB_URL, branch: env.CI_COMMIT_REF_NAME, commit: env.CI_COMMIT_SHA };
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

const TAMANO_PARTE = 2 * 1024 * 1024; // Test Manager recibe los archivos en partes de 2MB

export default class ReporteApp implements Reporter {
  // Por test.id: con retries, Playwright llama a onTestEnd una vez por intento y
  // aquí solo queda el último (el que decide si el test pasó o falló).
  private resultados = new Map<string, ResultadoCaso>();
  private inicio = new Date();

  onTestEnd(test: TestCase, result: TestResult): void {
    const proyecto = test.parent.project()?.name ?? '';
    if (proyecto === 'setup') return;
    const tags = test.tags ?? [];
    // El código del caso sale de la etiqueta @TC-… o, si no tiene, del inicio del título
    // ("TC-GEN-001 Smoke test…").
    const caso =
      tags.find((t) => /^@TC-/.test(t))?.slice(1) ??
      test.title.match(/^(TC-[A-Z]+\d*-\d+)\b/)?.[1] ??
      null;
    const requerimiento = tags.find((t) => /^@RN?F-/.test(t))?.slice(1) ?? null;

    let estado: ResultadoCaso['estado'];
    if (result.status === 'skipped') estado = 'omitido';
    else if (test.expectedStatus === 'failed' && result.status === 'failed') estado = 'fallo-esperado';
    else if (result.status === 'passed' && test.expectedStatus === 'passed') estado = 'aprobado';
    else estado = 'fallido';

    // Evidencia solo de los fallos reales: un 'fallo-esperado' es un defecto ya conocido.
    const captura = result.attachments.find((a) => a.name === 'screenshot' && a.contentType === 'image/png');
    const adjuntos =
      estado === 'fallido'
        ? result.attachments
            .filter((a) => a.path && (a.name === 'video' || a.name === 'trace'))
            .map((a) => ({ ruta: a.path!, nombre: `${a.name}-${path.basename(a.path!)}`, tipo: a.contentType }))
        : [];

    this.resultados.set(test.id, {
      caso,
      requerimiento,
      titulo: test.title,
      proyecto,
      estado,
      duracionMs: result.duration,
      intentos: result.retry + 1,
      // El mensaje completo (recortado) ayuda a entender el fallo en la pestaña Estabilidad.
      error: result.error?.message?.slice(0, 4000),
      anotaciones: test.annotations.map((a) => ({ tipo: a.type, descripcion: a.description })),
      capturaRuta: estado === 'fallido' && captura?.path ? captura.path : undefined,
      adjuntos,
    });
  }

  async onEnd(result: FullResult): Promise<void> {
    const url = process.env.REPORT_URL;
    const token = process.env.REPORT_TOKEN;
    if (!url || !token) {
      console.log('[ReporteApp] Sin REPORT_URL o REPORT_TOKEN en .env: no se envían resultados.');
      return;
    }
    const resultados = [...this.resultados.values()];
    if (resultados.length === 0) {
      console.log("[ReporteApp] No se ejecutó ningún test: no hay resultados que enviar.");
      return;
    }

    // Formato que espera Test Manager en /api/ingest: header x-api-key y
    // { runName, ci, results: [{ automationId, title, status, durationMs, errorMessage, screenshotBase64 }] }.
    // Usamos el ID del caso (TC-RFxxx-yy) como automationId cuando existe, así se
    // asocia al caso de prueba correspondiente en vez de crear uno nuevo cada vez.
    // Si varios tests llevan el mismo @TC-…, Test Manager los guarda como un solo
    // resultado (el peor) con el error de cada uno.
    const cuerpoTestManager = {
      runName: `Control de Compras · ${this.inicio.toLocaleString('es-CR')}`,
      ci: detectarCi(),
      results: await Promise.all(
        resultados.map(async (r) => ({
          automationId: r.caso || r.titulo,
          title: r.titulo,
          status: aEstadoTestManager(r.estado),
          durationMs: r.duracionMs,
          errorMessage: r.error,
          screenshotBase64: r.capturaRuta
            ? await readFile(r.capturaRuta).then((b) => b.toString('base64'), () => undefined)
            : undefined,
        }))
      ),
    };

    // Cuerpo original, más detallado (con requerimiento, anotaciones, etc.), por si
    // en el futuro quieres mandarlo también a tu propia app de reportes interna.
    const cuerpoDetallado = {
      sistema: 'Control de Compras DISA',
      ambiente: process.env.BASE_URL,
      inicio: this.inicio.toISOString(),
      fin: new Date().toISOString(),
      estadoGeneral: result.status,
      resumen: {
        total: resultados.length,
        aprobados: resultados.filter((r) => r.estado === 'aprobado').length,
        fallidos: resultados.filter((r) => r.estado === 'fallido').length,
        fallosEsperados: resultados.filter((r) => r.estado === 'fallo-esperado').length,
        omitidos: resultados.filter((r) => r.estado === 'omitido').length,
        conReintentos: resultados.filter((r) => r.intentos > 1).length,
      },
      resultados: resultados.map(({ capturaRuta: _c, adjuntos: _a, ...r }) => r),
    };
    void cuerpoDetallado; // referencia para no romper el build si luego lo usas

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': token },
        body: JSON.stringify(cuerpoTestManager),
      });
      if (!res.ok) {
        console.log(`[ReporteApp] Error al enviar (${res.status}): ${await res.text()}`);
        return;
      }
      const data: { results: { runCaseId: string }[]; warnings?: string[] } = await res.json();
      console.log(`[ReporteApp] ✅ Resultados enviados (${res.status}) — ${cuerpoTestManager.results.length} casos.`);
      for (const aviso of data.warnings ?? []) console.log(`[ReporteApp] ⚠️  ${aviso}`);

      await this.subirAdjuntos(url, token, resultados, data.results);
    } catch (e) {
      console.log(`[ReporteApp] No se pudo enviar: ${(e as Error).message}`);
    }
  }

  // Sube el video y el trace de cada test fallido al resultado que creó Test Manager
  // (las respuestas vienen en el mismo orden que los resultados enviados).
  private async subirAdjuntos(
    url: string,
    token: string,
    resultados: ResultadoCaso[],
    creados: { runCaseId: string }[]
  ): Promise<void> {
    const pendientes = resultados.flatMap((r, i) => r.adjuntos.map((a) => ({ ...a, runCaseId: creados[i]?.runCaseId })));
    if (pendientes.length === 0) return;

    const urlAdjuntos = url.replace(/\/?$/, '/attachments');
    const maximo = Number(process.env.REPORT_MAX_ADJUNTO_MB || 50) * 1024 * 1024;
    let subidos = 0;
    let omitidos = 0;

    for (const a of pendientes) {
      try {
        if (!a.runCaseId || (await stat(a.ruta)).size > maximo) {
          omitidos++;
          continue;
        }
        const datos = await readFile(a.ruta);
        const partes = Math.max(1, Math.ceil(datos.length / TAMANO_PARTE));
        const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        for (let i = 0; i < partes; i++) {
          const form = new FormData();
          form.append('runCaseId', a.runCaseId);
          form.append('uploadId', uploadId);
          form.append('chunkIndex', String(i));
          form.append('totalChunks', String(partes));
          form.append('filename', a.nombre);
          form.append('mimeType', a.tipo);
          form.append('chunk', new Blob([datos.subarray(i * TAMANO_PARTE, (i + 1) * TAMANO_PARTE)]));
          const res = await fetch(urlAdjuntos, { method: 'POST', headers: { 'x-api-key': token }, body: form });
          if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        }
        subidos++;
      } catch (e) {
        omitidos++;
        console.log(`[ReporteApp] No se pudo subir ${a.nombre}: ${(e as Error).message}`);
      }
    }
    console.log(
      `[ReporteApp] 📎 ${subidos} video(s)/trace(s) subidos` + (omitidos ? `, ${omitidos} omitidos` : '')
    );
  }
}
