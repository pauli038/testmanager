/**
 * Pasa las evidencias guardadas en la base de datos (base64 en
 * attachments.data) al bucket de Supabase Storage, sin perder ninguna:
 *
 *   1. Sin opciones: solo informa cuántos archivos hay en cada lugar.
 *   2. --apply: sube cada archivo al bucket, lo vuelve a descargar y compara
 *      su huella SHA-256 con la original. Solo si coinciden marca la fila con
 *      su storage_path. NO borra nada: la copia en la base de datos se queda.
 *      Desde ese momento la app sirve el archivo desde el bucket.
 *   3. --clear-db: para las filas ya migradas, descarga otra vez el archivo
 *      del bucket, lo compara con la copia de la base de datos y, solo si son
 *      idénticos, vacía la columna data. Si no coinciden, vuelve a subirlo
 *      desde la base de datos; si aun así no coincide, desmarca la fila para
 *      que la app vuelva a servir la copia de la base de datos. Córrelo
 *      cuando hayas comprobado en la app que las evidencias se ven bien.
 *
 * Se puede correr las veces que haga falta: lo ya hecho se salta, y un
 * archivo que falla se queda como estaba y se informa al final.
 * --limit=N procesa solo N archivos (para probar primero con pocos).
 *
 * Lo mismo se puede hacer sin instalar nada desde la app: página Usuarios >
 * "Evidencias en Supabase Storage" (solo admin).
 *
 * Uso (necesita DATABASE_URL, SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY):
 *   npx tsx --env-file=.env scripts/migrate-attachments-to-storage.ts
 *   npx tsx --env-file=.env scripts/migrate-attachments-to-storage.ts --apply
 *   npx tsx --env-file=.env scripts/migrate-attachments-to-storage.ts --clear-db
 */
import { storageEnabled } from "../src/lib/storage";
import {
  migrateOne,
  migrationSummary,
  pendingIds,
  type MigrationStep,
} from "../src/lib/attachment-migration";

const APPLY = process.argv.includes("--apply");
const CLEAR_DB = process.argv.includes("--clear-db");
const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1]) || Infinity;

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

async function summary() {
  const row = await migrationSummary();
  console.log(`Evidencias: ${row.total}`);
  console.log(`  solo en la base de datos:            ${row.dbOnly}`);
  console.log(`  en el bucket y aún en la base:       ${row.both}`);
  console.log(`  solo en el bucket (terminadas):      ${row.bucketOnly}`);
  console.log(`  espacio que ocupan en la base:       ~${mb(row.dbBytes)}`);
}

// Walks the pending rows one at a time (only ids are listed, so a big table
// never has to fit in memory).
async function run(step: MigrationStep) {
  let after = "";
  let done = 0;
  let ok = 0;
  const failed: string[] = [];
  while (done < LIMIT) {
    const ids = await pendingIds(step, after, 50);
    if (ids.length === 0) break;
    for (const id of ids) {
      if (done >= LIMIT) break;
      after = id;
      done++;
      const r = await migrateOne(step, id);
      if (!r) continue;
      if (r.ok) {
        ok++;
        console.log(`✔ ${r.filename}${r.message ? ` (${r.message})` : ""}`);
      } else {
        failed.push(`${r.id} ${r.filename}: ${r.message}`);
        console.error(`✘ ${r.filename}: ${r.message}`);
      }
    }
  }
  console.log(
    step === "copy"
      ? `\nCopiadas y verificadas: ${ok}. Con error (siguen en la base de datos): ${failed.length}`
      : `\nCopias borradas de la base de datos: ${ok}. Conservadas por error: ${failed.length}`
  );
  for (const f of failed) console.log(`  - ${f}`);
  if (step === "clear" && ok) {
    console.log(
      "\nPara que Supabase muestre el espacio liberado, corre en su SQL Editor: VACUUM FULL attachments;"
    );
  }
}

async function main() {
  if ((APPLY || CLEAR_DB) && !storageEnabled()) {
    throw new Error("Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno.");
  }
  await summary();
  if (APPLY) {
    console.log("\nCopiando al bucket…");
    await run("copy");
  } else if (CLEAR_DB) {
    console.log("\nBorrando de la base de datos las copias ya verificadas en el bucket…");
    await run("clear");
  } else {
    console.log("\nSimulación: no se cambió nada. Usa --apply para copiar al bucket.");
    return;
  }
  console.log("");
  await summary();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
