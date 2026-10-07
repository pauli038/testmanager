/**
 * Mueve un run que llegó al proyecto equivocado (p. ej. Playwright usó la API
 * key de otro proyecto) a su proyecto correcto:
 *   1. cada resultado del run pasa al caso del proyecto destino que tiene el
 *      mismo código (o, si no hay código, el mismo título);
 *   2. el run pasa al proyecto destino;
 *   3. los casos del proyecto origen que quedaron sin resultados ni defectos,
 *      y que solo existían por ese run, se borran.
 * Si algún resultado no tiene caso equivalente en el destino, no cambia nada.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/move-run-to-project.ts "<nombre del run>" "<proyecto destino>"            (simulación)
 *   npx tsx --env-file=.env scripts/move-run-to-project.ts "<nombre del run>" "<proyecto destino>" --apply    (aplica)
 */
import { db } from "../src/db";
import { defectTestCases, testCases, testRunCases, testRuns } from "../src/db/schema";
import { eq, inArray } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");
const [runName, targetName] = process.argv.slice(2).filter((a) => !a.startsWith("--"));

const norm = (s: string) => s.trim().toLowerCase();

async function main() {
  if (!runName || !targetName) throw new Error("Faltan argumentos: nombre del run y proyecto destino");

  const run = (await db.query.testRuns.findMany()).find((r) => r.name === runName);
  if (!run) throw new Error(`No existe un run llamado "${runName}"`);
  const target = (await db.query.projects.findMany()).find((p) => norm(p.name) === norm(targetName));
  if (!target) throw new Error(`No existe el proyecto "${targetName}"`);
  if (run.projectId === target.id) throw new Error("El run ya está en ese proyecto");

  const suites = await db.query.testSuites.findMany();
  const targetSuites = new Set(suites.filter((s) => s.projectId === target.id).map((s) => s.id));
  const allCases = await db.query.testCases.findMany();
  const targetCases = allCases.filter((c) => targetSuites.has(c.suiteId));
  const byCode = new Map(targetCases.filter((c) => c.code).map((c) => [c.code!.toUpperCase(), c]));
  const byTitle = new Map(targetCases.map((c) => [norm(c.title), c]));

  const results = await db.query.testRunCases.findMany({ where: eq(testRunCases.runId, run.id) });
  const moves: { runCaseId: string; from: (typeof allCases)[number]; to: (typeof allCases)[number] }[] = [];
  const missing: string[] = [];
  for (const r of results) {
    const from = allCases.find((c) => c.id === r.caseId)!;
    const to = (from.code && byCode.get(from.code.toUpperCase())) || byTitle.get(norm(from.title));
    if (to) moves.push({ runCaseId: r.id, from, to });
    else missing.push(`${from.code ?? ""} "${from.title}"`);
  }

  console.log(`Run "${run.name}" → proyecto "${target.name}": ${results.length} resultado(s)`);
  for (const m of moves) console.log(`  ${m.from.code ?? "-"} "${m.from.title}" → caso de destino ${m.to.id.slice(0, 8)}`);
  if (missing.length) {
    console.log(`\nSin caso equivalente en el destino (no se aplica nada):\n  ${missing.join("\n  ")}`);
    process.exit(1);
  }

  // Source cases that only exist because of this run can go once it moves.
  // A source case is still used if it has results in other runs or linked
  // defects; those are kept.
  const sourceCaseIds = [...new Set(moves.map((m) => m.from.id))];
  const [sourceResults, defectLinks] = await Promise.all([
    db
      .select({ caseId: testRunCases.caseId, runId: testRunCases.runId })
      .from(testRunCases)
      .where(inArray(testRunCases.caseId, sourceCaseIds)),
    db
      .select({ caseId: defectTestCases.caseId })
      .from(defectTestCases)
      .where(inArray(defectTestCases.caseId, sourceCaseIds)),
  ]);
  const stillUsed = new Set([
    ...sourceResults.filter((r) => r.runId !== run.id).map((r) => r.caseId),
    ...defectLinks.map((d) => d.caseId),
  ]);
  const toDelete = sourceCaseIds.filter((id) => !stillUsed.has(id));
  console.log(
    `\nCasos del proyecto origen que se borrarían (sin otros resultados ni defectos): ${toDelete.length}` +
      (stillUsed.size ? ` · se conservan ${stillUsed.size} con otros usos` : "")
  );

  if (!APPLY) {
    console.log("\nSimulación: no se cambió nada. Vuelve a ejecutar con --apply para aplicar.");
    process.exit(0);
  }

  await db.transaction(async (tx) => {
    for (const m of moves) {
      await tx.update(testRunCases).set({ caseId: m.to.id }).where(eq(testRunCases.id, m.runCaseId));
    }
    await tx.update(testRuns).set({ projectId: target.id }).where(eq(testRuns.id, run.id));
    if (toDelete.length) await tx.delete(testCases).where(inArray(testCases.id, toDelete));
  });
  console.log("\nAplicado.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
