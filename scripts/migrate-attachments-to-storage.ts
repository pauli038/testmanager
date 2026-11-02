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
 * Uso (necesita DATABASE_URL, SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY):
 *   npx tsx --env-file=.env scripts/migrate-attachments-to-storage.ts
 *   npx tsx --env-file=.env scripts/migrate-attachments-to-storage.ts --apply
 *   npx tsx --env-file=.env scripts/migrate-attachments-to-storage.ts --clear-db
 */
import { createHash } from "node:crypto";
import { db } from "../src/db";
import { attachments } from "../src/db/schema";
import { and, asc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { downloadObject, storageEnabled, uploadObject } from "../src/lib/storage";

const APPLY = process.argv.includes("--apply");
const CLEAR_DB = process.argv.includes("--clear-db");
const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1]) || Infinity;

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

async function summary() {
  const [row] = await db
    .select({
      total: sql<number>`count(*)`,
      dbOnly: sql<number>`count(*) filter (where ${attachments.storagePath} is null)`,
      both: sql<number>`count(*) filter (where ${attachments.storagePath} is not null and ${attachments.data} is not null)`,
      bucketOnly: sql<number>`count(*) filter (where ${attachments.storagePath} is not null and ${attachments.data} is null)`,
      dbBytes: sql<number>`coalesce(sum(length(${attachments.data})), 0) * 3 / 4`,
    })
    .from(attachments);
  console.log(`Evidencias: ${row.total}`);
  console.log(`  solo en la base de datos:            ${row.dbOnly}`);
  console.log(`  en el bucket y aún en la base:       ${row.both}`);
  console.log(`  solo en el bucket (terminadas):      ${row.bucketOnly}`);
  console.log(`  espacio que ocupan en la base:       ~${mb(Number(row.dbBytes))}`);
}

// Walks the rows that match `where` one at a time (only ids are listed, so a
// big table never has to fit in memory).
async function forEachRow(where: ReturnType<typeof and>, work: (id: string) => Promise<void>) {
  let after = "";
  let done = 0;
  while (done < LIMIT) {
    const ids = await db
      .select({ id: attachments.id })
      .from(attachments)
      .where(and(where, gt(attachments.id, after)))
      .orderBy(asc(attachments.id))
      .limit(50);
    if (ids.length === 0) break;
    for (const { id } of ids) {
      if (done >= LIMIT) break;
      await work(id);
      done++;
      after = id;
    }
  }
}

async function copyToBucket() {
  let copied = 0;
  const failed: string[] = [];
  await forEachRow(and(isNull(attachments.storagePath), isNotNull(attachments.data)), async (id) => {
    const row = await db.query.attachments.findFirst({ where: eq(attachments.id, id) });
    if (!row?.data || row.storagePath) return;
    const original = Buffer.from(row.data, "base64");
    try {
      await uploadObject(id, original, row.mimeType);
      const copy = await downloadObject(id);
      if (sha256(copy) !== sha256(original)) throw new Error("la copia del bucket no coincide");
      await db
        .update(attachments)
        .set({ storagePath: id })
        .where(and(eq(attachments.id, id), isNull(attachments.storagePath)));
      copied++;
      console.log(`✔ ${row.filename} (${mb(original.length)})`);
    } catch (err) {
      failed.push(`${id} ${row.filename}: ${(err as Error).message}`);
      console.error(`✘ ${row.filename}: ${(err as Error).message}`);
    }
  });
  console.log(`\nCopiadas y verificadas: ${copied}. Con error (siguen en la base de datos): ${failed.length}`);
  for (const f of failed) console.log(`  - ${f}`);
}

async function clearDbCopies() {
  let cleared = 0;
  const failed: string[] = [];
  await forEachRow(and(isNotNull(attachments.storagePath), isNotNull(attachments.data)), async (id) => {
    const row = await db.query.attachments.findFirst({ where: eq(attachments.id, id) });
    if (!row?.data || !row.storagePath) return;
    const original = Buffer.from(row.data, "base64");
    try {
      if (sha256(await downloadObject(row.storagePath)) !== sha256(original)) {
        // The bucket copy changed since --apply: upload it again from the database.
        await uploadObject(row.storagePath, original, row.mimeType);
        if (sha256(await downloadObject(row.storagePath)) !== sha256(original)) {
          await db.update(attachments).set({ storagePath: null }).where(eq(attachments.id, id));
          throw new Error(
            "el archivo del bucket no coincide con el de la base de datos; se sigue sirviendo desde la base"
          );
        }
        console.log(`  ↻ ${row.filename}: la copia del bucket no coincidía, se volvió a subir`);
      }
      await db.update(attachments).set({ data: null }).where(eq(attachments.id, id));
      cleared++;
      console.log(`✔ ${row.filename}`);
    } catch (err) {
      failed.push(`${id} ${row.filename}: ${(err as Error).message}`);
      console.error(`✘ ${row.filename}: ${(err as Error).message}`);
    }
  });
  console.log(`\nCopias borradas de la base de datos: ${cleared}. Conservadas por error: ${failed.length}`);
  for (const f of failed) console.log(`  - ${f}`);
  if (cleared) {
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
    await copyToBucket();
  } else if (CLEAR_DB) {
    console.log("\nBorrando de la base de datos las copias ya verificadas en el bucket…");
    await clearDbCopies();
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
