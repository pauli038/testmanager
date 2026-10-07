/**
 * Fusiona pares concretos de casos duplicados: un caso que Playwright creó
 * en "Automatizado (Playwright)" con un título distinto al del caso escrito
 * a mano que cubre lo mismo (ver /api/ingest).
 *
 * NO borra historial: mueve los resultados de ejecución (test_run_cases) y
 * los defectos relacionados del duplicado al caso que se conserva, le agrega
 * a sus etiquetas los códigos (TC-…, RN-…) del test de Playwright para que
 * los próximos resultados lleguen solos a él, y recién entonces borra el
 * duplicado.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/merge-duplicate-cases.ts            (simulación)
 *   npx tsx --env-file=.env scripts/merge-duplicate-cases.ts --apply    (aplica los cambios)
 */
import { db } from "../src/db";
import { testCases, testRunCases, defectTestCases } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { extractCodes, addCodesToTags } from "../src/lib/case-matching";

const APPLY = process.argv.includes("--apply");

// [id del duplicado, id del caso que se conserva] — revisados a mano.
const PAIRS: [string, string][] = [
  // TC-RF002-13 → "Los nombres de los roles se muestran correctamente en el formulario"
  ["33875f19-167b-4909-b4aa-7e00dd2b9755", "b812e3a8-dc96-428d-94d5-2191a2d9a00e"],
];

// Pares identificados por el inicio del id (se resuelven al id completo).
const PAIRS_BY_PREFIX: [string, string][] = [
  ["cff68975", "0e6d0197"], // TC-RF020-04 → La fecha inicial no se cuenta en el cálculo
  ["a6d1f9dd", "1a11b383"], // TC-RF020-05 → Un feriado dentro del rango no se cuenta
  ["f1c6267e", "d1d815e5"], // TC-RF020-06 → Fecha final en sábado
  ["e53c39b8", "c0384c57"], // TC-RF020-07 → Un feriado dentro de un período de vacaciones…
  ["7ca27872", "b57fdd5a"], // TC-RF001-06 → Acceso a una URL protegida sin sesión iniciada
  ["b2fb1d72", "1fb4e0b7"], // TC-RF002-08 → Búsqueda y paginación del listado de usuarios
  ["12fcf34b", "8f216a8b"], // RN-044 → La criticidad general es la mayor…
  ["3ded5c15", "1ade106a"], // RN-012 / TC-RF023-01 → métrica de publicación – Compra CD
  ["dbaa19ce", "0b18247f"], // RN-013 / TC-RF023-02 → métrica de adjudicación – Compra CD
  ["9de0e2a9", "d1af0112"], // RN-014 → métrica de tiempo total – Compra CD
  ["888953fa", "925bf6c2"], // TC-RF047-02 → Días hábiles del AC con respuesta registrada
];

async function main() {
  const allCases = await db.query.testCases.findMany();
  const byPrefix = (prefix: string) => {
    const found = allCases.filter((c) => c.id.startsWith(prefix));
    if (found.length !== 1) throw new Error(`El prefijo ${prefix} coincide con ${found.length} casos`);
    return found[0].id;
  };
  // TC-RF051-01: lo busca por código en vez de id porque no se revisó en la tabla.
  const rf051Dup = allCases.find((c) => c.automationId?.includes("(TC-RF051-01)"));
  const rf051Keeper = allCases.find((c) => c.automationId === "TC-RF051-01");

  const pairs: [string, string][] = [
    ...PAIRS,
    ...PAIRS_BY_PREFIX.map(([d, k]): [string, string] => [byPrefix(d), byPrefix(k)]),
    ...(rf051Dup && rf051Keeper ? [[rf051Dup.id, rf051Keeper.id] as [string, string]] : []),
  ];

  let merged = 0;
  for (const [dupId, keeperId] of pairs) {
    const dup = allCases.find((c) => c.id === dupId);
    const keeper = allCases.find((c) => c.id === keeperId);
    if (!dup || !keeper) {
      console.log(`[OMITIDO] ${dupId} → ${keeperId}: alguno de los dos ya no existe.`);
      continue;
    }

    const runCaseCount = (
      await db.select({ id: testRunCases.id }).from(testRunCases).where(eq(testRunCases.caseId, dup.id))
    ).length;
    const dupDefects = await db.query.defectTestCases.findMany({ where: eq(defectTestCases.caseId, dup.id) });
    const keeperDefectIds = new Set(
      (await db.query.defectTestCases.findMany({ where: eq(defectTestCases.caseId, keeper.id) })).map(
        (d) => d.defectId
      )
    );
    const codes = extractCodes(`${dup.automationId ?? ""} ${dup.title}`);
    const newTags = addCodesToTags(keeper.tags, codes);

    console.log(
      `${APPLY ? "[APLICANDO]" : "[SIMULACIÓN]"} "${dup.title}" → "${keeper.title}" — ` +
        `${runCaseCount} resultado(s), ${dupDefects.length} defecto(s), etiquetas: "${newTags}"`
    );

    if (APPLY) {
      await db.update(testRunCases).set({ caseId: keeper.id }).where(eq(testRunCases.caseId, dup.id));
      for (const link of dupDefects) {
        // Si el defecto ya estaba vinculado al caso que se conserva, el
        // vínculo del duplicado sobra (se borra junto con el caso).
        if (!keeperDefectIds.has(link.defectId)) {
          await db.update(defectTestCases).set({ caseId: keeper.id }).where(eq(defectTestCases.id, link.id));
        }
      }
      await db
        .update(testCases)
        .set({ automated: true, automationId: keeper.automationId ?? dup.automationId, tags: newTags })
        .where(eq(testCases.id, keeper.id));
      await db.delete(testCases).where(eq(testCases.id, dup.id));
    }
    merged++;
  }

  console.log(`\n${APPLY ? "Fusionados" : "Se fusionarían"} ${merged} caso(s) duplicado(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
