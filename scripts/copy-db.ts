/**
 * Copia todos los datos de una base Postgres a otra (p. ej. de Neon a
 * Supabase). Las tablas de destino deben existir ya: arranca la app una vez
 * apuntando a la base nueva (o deja que este script lo haga) para que se
 * apliquen las migraciones.
 *
 * Copia tabla por tabla respetando el orden de las llaves foráneas, en una
 * sola transacción en destino. Si el destino ya tiene datos, se detiene
 * (usa --truncate para vaciarlo antes).
 *
 * Uso:
 *   SOURCE_DATABASE_URL=postgresql://...origen... \
 *   DATABASE_URL=postgresql://...supabase... \
 *   npx tsx scripts/copy-db.ts [--truncate]
 *
 * Para el destino usa la conexión directa o el "Session pooler" (puerto
 * 5432) de Supabase, no el "Transaction pooler" (6543).
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "path";

// Orden de inserción: cada tabla va después de las que referencia.
const TABLES = [
  "users",
  "projects",
  "project_members",
  "test_suites",
  "test_cases",
  "case_kanban_columns",
  "test_plans",
  "test_plan_suites",
  "test_runs",
  "test_run_cases",
  "defects",
  "defect_test_cases",
  "attachments",
  "api_keys",
];

const BATCH = 200;

async function main() {
  const sourceUrl = process.env.SOURCE_DATABASE_URL;
  const targetUrl = process.env.DATABASE_URL;
  if (!sourceUrl || !targetUrl) {
    throw new Error("Define SOURCE_DATABASE_URL (origen) y DATABASE_URL (destino).");
  }
  if (sourceUrl === targetUrl) {
    throw new Error("Origen y destino son la misma base de datos.");
  }
  const truncate = process.argv.includes("--truncate");

  const source = postgres(sourceUrl, { max: 1 });
  const target = postgres(targetUrl, { max: 1 });

  try {
    console.log("Aplicando migraciones en destino...");
    await migrate(drizzle(target), {
      migrationsFolder: path.join(process.cwd(), "drizzle"),
    });

    const existing = await source<{ table_name: string }[]>`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'`;
    const unknown = existing
      .map((r) => r.table_name)
      .filter((t) => !TABLES.includes(t));
    if (unknown.length) {
      console.warn(`Aviso: tablas en origen que no se copian: ${unknown.join(", ")}`);
    }

    await target.begin(async (tx) => {
      if (truncate) {
        await tx.unsafe(`truncate ${TABLES.map((t) => `"${t}"`).join(", ")} cascade`);
      } else {
        for (const t of TABLES) {
          const [{ n }] = await tx.unsafe(`select count(*)::int as n from "${t}"`);
          if (n > 0) {
            throw new Error(`La tabla "${t}" en destino ya tiene ${n} filas. Usa --truncate para vaciarla.`);
          }
        }
      }

      for (const t of TABLES) {
        let copied = 0;
        const cursor = source.unsafe(`select * from "${t}"`).cursor(BATCH);
        for await (const rows of cursor) {
          await tx`insert into ${tx(t)} ${tx(rows as Record<string, unknown>[])}`;
          copied += rows.length;
        }
        console.log(`  ${t}: ${copied} filas`);
      }
    });

    console.log("Listo. Datos copiados.");
  } finally {
    await source.end();
    await target.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
