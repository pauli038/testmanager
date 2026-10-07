/**
 * Llena el campo "código" de los casos de prueba que todavía no lo tienen,
 * usando el código TC-… que ya aparece en el caso:
 *   1. su automationId, si es solo un código (ej. "TC-RF002-13");
 *   2. sus etiquetas, si tienen un único código TC-…;
 *   3. su título, si tiene un único código TC-… (ej. "TC-CAT-023 Búsqueda…");
 *   4. su automationId, si contiene un único código TC-….
 * No toca casos que ya tienen código ni borra nada de etiquetas o títulos.
 * Si el mismo código le correspondería a varios casos del mismo proyecto, no
 * se lo asigna a ninguno y lo informa para revisarlo a mano.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/backfill-case-codes.ts            (simulación)
 *   npx tsx --env-file=.env scripts/backfill-case-codes.ts --apply    (aplica los cambios)
 */
import { db } from "../src/db";
import { testCases } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { extractCodes } from "../src/lib/case-matching";

const APPLY = process.argv.includes("--apply");

const tcCodes = (text: string) => extractCodes(text).filter((c) => c.startsWith("TC-"));
const single = (codes: string[]) => (codes.length === 1 ? codes[0] : null);

// `exact` = the automationId is just the code, the strongest evidence.
function proposeCode(c: { automationId: string | null; tags: string; title: string }) {
  const aid = c.automationId?.trim() ?? "";
  if (aid && tcCodes(aid)[0] === aid.toUpperCase()) return { code: aid.toUpperCase(), exact: true };
  const code = single(tcCodes(c.tags)) ?? single(tcCodes(c.title)) ?? single(tcCodes(aid));
  return code ? { code, exact: false } : null;
}

async function main() {
  const projects = await db.query.projects.findMany();
  const suites = await db.query.testSuites.findMany();
  const cases = await db.query.testCases.findMany();
  let assigned = 0;

  for (const p of projects) {
    const suiteIds = new Set(suites.filter((s) => s.projectId === p.id).map((s) => s.id));
    const projectCases = cases.filter((c) => suiteIds.has(c.suiteId));
    const taken = new Set(projectCases.filter((c) => c.code).map((c) => c.code!.toUpperCase()));

    type Candidate = (typeof projectCases)[number] & { exact: boolean };
    const proposals = new Map<string, Candidate[]>();
    for (const c of projectCases) {
      if (c.code) continue;
      const proposal = proposeCode(c);
      if (proposal)
        proposals.set(proposal.code, [...(proposals.get(proposal.code) ?? []), { ...c, exact: proposal.exact }]);
    }

    const conflicts: string[] = [];
    const toAssign: { id: string; title: string; code: string }[] = [];
    for (const [code, candidates] of proposals) {
      // Among several candidates, the one whose automationId is exactly the
      // code wins (if it's the only such one).
      const exact = candidates.filter((c) => c.exact);
      const list = candidates.length > 1 && exact.length === 1 ? exact : candidates;
      if (taken.has(code) || list.length > 1) {
        conflicts.push(`${code}: ${list.map((c) => `"${c.title}"`).join(", ")}${taken.has(code) ? " (ya usado)" : ""}`);
      } else {
        toAssign.push({ id: list[0].id, title: list[0].title, code });
      }
    }

    if (toAssign.length === 0 && conflicts.length === 0) continue;
    const withoutCode = projectCases.filter((c) => !c.code).length;
    console.log(
      `\n=== ${p.name}: ${toAssign.length} de ${withoutCode} casos sin código recibirían uno`
    );
    for (const a of toAssign.slice(0, 10)) console.log(`  ${a.code}  ← "${a.title}"`);
    if (toAssign.length > 10) console.log(`  … y ${toAssign.length - 10} más`);
    if (conflicts.length) {
      console.log(`  Sin asignar por conflicto (${conflicts.length}):`);
      for (const c of conflicts) console.log(`    ${c}`);
    }

    if (APPLY) {
      for (const a of toAssign) {
        await db.update(testCases).set({ code: a.code }).where(eq(testCases.id, a.id));
      }
    }
    assigned += toAssign.length;
  }

  console.log(`\n${APPLY ? "Asignados" : "Se asignarían"} ${assigned} código(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
