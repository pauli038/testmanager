/**
 * FASE 1 de la migración Supabase → SQLite: inventario de SOLO LECTURA.
 *
 * Todo corre dentro de UNA transacción "REPEATABLE READ READ ONLY": Postgres
 * rechaza cualquier escritura en ella, y todos los conteos salen de la misma
 * foto de los datos. Antes de leer nada comprueba que la transacción de verdad
 * es de solo lectura; si no, se detiene. Solo lee el catálogo y hace count(*).
 *
 * Uso (desde la carpeta del repo, con SUPABASE_DB_URL en .env.migracion):
 *   npx tsx --env-file=.env.migracion scripts/sqlite-migration/01-inventario.ts
 *
 * Deja en migracion-sqlite/ (ignorada por git):
 *   fase1-inventario.md    reporte para leer / compartir (sin datos de filas)
 *   fase1-inventario.json  lo mismo, completo, para los pasos siguientes
 */
import postgres from "postgres";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const url = process.env.SUPABASE_DB_URL;
if (!url) throw new Error("Falta SUPABASE_DB_URL (cadena del Session pooler, puerto 5432).");
if (/:6543\b/.test(url)) {
  throw new Error("Usa el Session pooler (puerto 5432), no el Transaction pooler (6543).");
}

const OUT = path.join(process.cwd(), "migracion-sqlite");
const SYSTEM_SCHEMAS = ["pg_catalog", "information_schema", "pg_toast"];

type Row = Record<string, unknown>;

async function main() {
  const sql = postgres(url!, {
    max: 1,
    prepare: false,
    onnotice: () => undefined,
    connection: { application_name: "inventario-solo-lectura" },
  });
  try {
    const report = await sql.begin("isolation level repeatable read read only", async (tx) => {
      const [{ ro }] = await tx`select current_setting('transaction_read_only') as ro`;
      if (ro !== "on") throw new Error("La transacción no es de solo lectura: me detengo.");

      // Runs a query; if this role can't read something, records it instead of
      // aborting the whole transaction.
      const safe = async <T,>(label: string, q: (s: typeof tx) => Promise<T>): Promise<T | { error: string }> => {
        try {
          return await tx.savepoint((sp) => q(sp as unknown as typeof tx));
        } catch (err) {
          return { error: `${label}: ${(err as Error).message}` };
        }
      };

      const [server] = await tx`select version() as version, current_setting('server_version_num') as num,
        current_user as usuario, current_database() as base, now() as momento`;

      const schemas = await tx`
        select n.nspname as schema, pg_get_userbyid(n.nspowner) as owner,
          (select count(*)::int from pg_class c where c.relnamespace = n.oid and c.relkind in ('r','p')) as tablas
        from pg_namespace n
        where n.nspname <> all(${SYSTEM_SCHEMAS}) and n.nspname not like 'pg_temp%' and n.nspname not like 'pg_toast%'
        order by 1`;

      const tables = await tx`
        select n.nspname as schema, c.relname as tabla, c.relkind::text as tipo,
          c.relrowsecurity as rls, c.relforcerowsecurity as rls_forzado,
          pg_total_relation_size(c.oid)::bigint as bytes,
          exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e') as de_extension
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where c.relkind in ('r','p') and n.nspname <> all(${SYSTEM_SCHEMAS})
        order by 1, 2`;

      const columns = await tx`
        select n.nspname as schema, c.relname as tabla, a.attnum as pos, a.attname as columna,
          format_type(a.atttypid, a.atttypmod) as tipo, t.typtype::text as clase_tipo,
          a.attnotnull as not_null, pg_get_expr(ad.adbin, ad.adrelid) as defecto,
          nullif(a.attgenerated, '')::text as generada, nullif(a.attidentity, '')::text as identity,
          a.attndims as dimensiones
        from pg_attribute a
        join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
        join pg_type t on t.oid = a.atttypid
        left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
        where c.relkind in ('r','p') and a.attnum > 0 and not a.attisdropped
          and n.nspname <> all(${SYSTEM_SCHEMAS})
        order by 1, 2, 3`;

      const constraints = await tx`
        select n.nspname as schema, c.relname as tabla, k.conname as nombre, k.contype::text as tipo,
          pg_get_constraintdef(k.oid) as definicion
        from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
        where n.nspname <> all(${SYSTEM_SCHEMAS})
        order by 1, 2, 4, 3`;

      const indexes = await tx`
        select schemaname as schema, tablename as tabla, indexname as nombre, indexdef as definicion
        from pg_indexes where schemaname <> all(${SYSTEM_SCHEMAS}) order by 1, 2, 3`;

      const sequences = await safe("secuencias", (s) => s`
        select schemaname as schema, sequencename as secuencia, data_type::text as tipo, last_value
        from pg_sequences where schemaname <> all(${SYSTEM_SCHEMAS}) order by 1, 2`);

      const views = await tx`
        select n.nspname as schema, c.relname as nombre, c.relkind::text as tipo
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where c.relkind in ('v','m') and n.nspname <> all(${SYSTEM_SCHEMAS})
          and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
        order by 1, 2`;

      const functions = await tx`
        select n.nspname as schema, p.proname as nombre, p.prokind::text as tipo,
          pg_get_function_identity_arguments(p.oid) as argumentos, l.lanname as lenguaje
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_language l on l.oid = p.prolang
        where n.nspname <> all(${SYSTEM_SCHEMAS})
          and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
        order by 1, 2`;

      const triggers = await tx`
        select n.nspname as schema, c.relname as tabla, t.tgname as nombre, pg_get_triggerdef(t.oid) as definicion
        from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
        where not t.tgisinternal and n.nspname <> all(${SYSTEM_SCHEMAS})
        order by 1, 2, 3`;

      const policies = await tx`
        select schemaname as schema, tablename as tabla, policyname as nombre, cmd as comando,
          roles::text as roles, qual as usando, with_check as con_check
        from pg_policies order by 1, 2, 3`;

      const types = await tx`
        select n.nspname as schema, t.typname as nombre, t.typtype::text as clase,
          (select string_agg(e.enumlabel, ', ' order by e.enumsortorder) from pg_enum e where e.enumtypid = t.oid) as valores
        from pg_type t join pg_namespace n on n.oid = t.typnamespace
        where t.typtype in ('e','d','r','c') and n.nspname <> all(${SYSTEM_SCHEMAS})
          and (t.typtype <> 'c' or exists (select 1 from pg_class c where c.oid = t.typrelid and c.relkind = 'c'))
          and not exists (select 1 from pg_depend d where d.objid = t.oid and d.deptype = 'e')
        order by 1, 2`;

      const extensions = await tx`
        select e.extname as nombre, e.extversion as version, n.nspname as schema
        from pg_extension e join pg_namespace n on n.oid = e.extnamespace order by 1`;

      // Exact row counts, table by table, in the same snapshot.
      const counts: Row[] = [];
      for (const t of tables) {
        const r = await safe(`${t.schema}.${t.tabla}`, (s) =>
          s`select count(*)::bigint as n from ${s(t.schema as string)}.${s(t.tabla as string)}`
        );
        counts.push({
          schema: t.schema,
          tabla: t.tabla,
          filas: Array.isArray(r) ? String(r[0].n) : null,
          error: Array.isArray(r) ? null : (r as { error: string }).error,
        });
      }

      // Files in Supabase Storage (they live outside the database; only their
      // metadata is in storage.objects).
      const storage = await safe("storage", (s) => s`
        select b.id as bucket, b.public as publico, count(o.id)::int as archivos,
          coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint as bytes
        from storage.buckets b left join storage.objects o on o.bucket_id = b.id
        group by b.id, b.public order by 1`);

      return {
        server, schemas, tables, columns, constraints, indexes, sequences, views, functions,
        triggers, policies, types, extensions, counts, storage,
      };
    });

    mkdirSync(OUT, { recursive: true });
    writeFileSync(
      path.join(OUT, "fase1-inventario.json"),
      JSON.stringify(report, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2)
    );
    writeFileSync(path.join(OUT, "fase1-inventario.md"), toMarkdown(report));
    console.log(`Listo. Revisa ${path.join("migracion-sqlite", "fase1-inventario.md")}`);
  } finally {
    await sql.end();
  }
}

// ---------- Report ----------
const mb = (b: unknown) => `${(Number(b) / 1024 / 1024).toFixed(2)} MB`;
const cell = (v: unknown) =>
  v === null || v === undefined ? "" : String(v).replace(/\|/g, "\\|").replace(/\n/g, " ");
function table(rows: Row[] | { error: string }, cols: string[]) {
  if (!Array.isArray(rows)) return `_No se pudo leer: ${rows.error}_\n`;
  if (rows.length === 0) return "_Ninguno._\n";
  return [
    `| ${cols.join(" | ")} |`,
    `| ${cols.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${cols.map((c) => cell(r[c])).join(" | ")} |`),
  ].join("\n") + "\n";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toMarkdown(r: any) {
  const out: string[] = [];
  out.push(`# Fase 1 — Inventario de Supabase (solo lectura)\n`);
  out.push(`- Servidor: ${r.server.version}`);
  out.push(`- Base: ${r.server.base} · usuario: ${r.server.usuario} · foto tomada: ${r.server.momento}\n`);

  out.push(`## Esquemas\n`);
  out.push(table(r.schemas, ["schema", "owner", "tablas"]));

  out.push(`## Tablas y filas exactas\n`);
  const sizes = new Map(r.tables.map((t: Row) => [`${t.schema}.${t.tabla}`, t]));
  out.push(
    table(
      r.counts.map((c: Row) => {
        const t = sizes.get(`${c.schema}.${c.tabla}`) as Row;
        return { ...c, tamaño: mb(t.bytes), rls: t.rls ? "sí" : "no", de_extension: t.de_extension ? "sí" : "no" };
      }),
      ["schema", "tabla", "filas", "tamaño", "rls", "de_extension", "error"]
    )
  );

  out.push(`## Columnas\n`);
  out.push(table(r.columns, ["schema", "tabla", "columna", "tipo", "clase_tipo", "not_null", "defecto", "generada", "identity"]));
  out.push(`## Restricciones (p = PK, f = FK, u = UNIQUE, c = CHECK, x = EXCLUDE)\n`);
  out.push(table(r.constraints, ["schema", "tabla", "tipo", "nombre", "definicion"]));
  out.push(`## Índices\n`);
  out.push(table(r.indexes, ["schema", "tabla", "nombre", "definicion"]));
  out.push(`## Secuencias\n`);
  out.push(table(r.sequences, ["schema", "secuencia", "tipo", "last_value"]));
  out.push(`## Vistas (v) y vistas materializadas (m)\n`);
  out.push(table(r.views, ["schema", "nombre", "tipo"]));
  out.push(`## Funciones y procedimientos (sin los de extensiones)\n`);
  out.push(table(r.functions, ["schema", "nombre", "tipo", "argumentos", "lenguaje"]));
  out.push(`## Triggers\n`);
  out.push(table(r.triggers, ["schema", "tabla", "nombre", "definicion"]));
  out.push(`## Políticas RLS\n`);
  out.push(table(r.policies, ["schema", "tabla", "nombre", "comando", "roles", "usando", "con_check"]));
  out.push(`## Tipos personalizados y ENUMs\n`);
  out.push(table(r.types, ["schema", "nombre", "clase", "valores"]));
  out.push(`## Extensiones\n`);
  out.push(table(r.extensions, ["nombre", "version", "schema"]));
  out.push(`## Supabase Storage (archivos fuera de la base)\n`);
  out.push(
    table(
      Array.isArray(r.storage) ? r.storage.map((s: Row) => ({ ...s, tamaño: mb(s.bytes) })) : r.storage,
      ["bucket", "publico", "archivos", "tamaño"]
    )
  );
  return out.join("\n");
}

main().catch((err) => {
  console.error("ERROR:", err.message);
  process.exit(1);
});
