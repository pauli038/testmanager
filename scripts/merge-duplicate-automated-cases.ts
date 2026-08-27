/**
 * Fusiona casos de prueba duplicados que quedaron en la suite
 * "Automatizado (Playwright)" cuando un caso con el mismo nombre ya
 * existía a mano en su suite real (ver /api/ingest).
 *
 * NO borra historial: por cada duplicado encontrado, primero mueve sus
 * resultados de ejecución (test_run_cases) y defectos relacionados al caso
 * "bueno" que vive en la suite correcta, y solo después borra el caso
 * duplicado (que ya quedó sin referencias).
 *
 * Uso:
 *   npx tsx scripts/merge-duplicate-automated-cases.ts            (simulación, no cambia nada)
 *   npx tsx scripts/merge-duplicate-automated-cases.ts --apply    (aplica los cambios)
 *
 * Requiere DATABASE_URL apuntando a la base real (mismo .env que usa la app).
 */
import { db } from "../src/db";
import { testSuites, testCases, testRunCases, defects } from "../src/db/schema";
import { eq, and, ne, inArray } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");

async function main() {
  const allProjects = await db.query.projects.findMany();
  let totalMerges = 0;

  for (const project of allProjects) {
    const autoSuite = await db.query.testSuites.findFirst({
      where: and(
        eq(testSuites.projectId, project.id),
        eq(testSuites.name, "Automatizado (Playwright)")
      ),
    });
    if (!autoSuite) continue;

    const autoCases = await db.query.testCases.findMany({
      where: eq(testCases.suiteId, autoSuite.id),
    });
    if (autoCases.length === 0) continue;

    const otherSuites = await db.query.testSuites.findMany({
      where: and(eq(testSuites.projectId, project.id), ne(testSuites.id, autoSuite.id)),
    });
    const otherSuiteIds = otherSuites.map((s) => s.id);
    if (otherSuiteIds.length === 0) continue;

    const suiteNameById = Object.fromEntries(otherSuites.map((s) => [s.id, s.name]));

    const otherCases = await db.query.testCases.findMany({
      where: inArray(testCases.suiteId, otherSuiteIds),
    });

    // First automated case per normalized title wins as the "keeper".
    const keeperByTitle = new Map<string, (typeof otherCases)[number]>();
    for (const c of otherCases) {
      if (!c.automated) continue;
      const key = c.title.trim().toLowerCase();
      if (!keeperByTitle.has(key)) keeperByTitle.set(key, c);
    }

    for (const dup of autoCases) {
      const keeper = keeperByTitle.get(dup.title.trim().toLowerCase());
      if (!keeper) continue;

      const runCaseCount = (
        await db
          .select({ id: testRunCases.id })
          .from(testRunCases)
          .where(eq(testRunCases.caseId, dup.id))
      ).length;
      const defectCount = (
        await db.select({ id: defects.id }).from(defects).where(eq(defects.caseId, dup.id))
      ).length;

      console.log(
        `${APPLY ? "[APLICANDO]" : "[SIMULACIÓN]"} "${project.name}": "${dup.title}" ` +
          `(Automatizado (Playwright)) → suite "${suiteNameById[keeper.suiteId]}" — ` +
          `${runCaseCount} resultado(s) de ejecución, ${defectCount} defecto(s).`
      );

      if (APPLY) {
        await db
          .update(testRunCases)
          .set({ caseId: keeper.id })
          .where(eq(testRunCases.caseId, dup.id));
        await db.update(defects).set({ caseId: keeper.id }).where(eq(defects.caseId, dup.id));
        if (!keeper.automationId && dup.automationId) {
          await db
            .update(testCases)
            .set({ automationId: dup.automationId })
            .where(eq(testCases.id, keeper.id));
        }
        await db.delete(testCases).where(eq(testCases.id, dup.id));
      }

      totalMerges++;
    }
  }

  console.log(
    `\n${APPLY ? "Fusionados" : "Se fusionarían"} ${totalMerges} caso(s) duplicado(s).`
  );
  if (!APPLY && totalMerges > 0) {
    console.log("Revisa la lista de arriba y vuelve a ejecutar con --apply para aplicar los cambios.");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
