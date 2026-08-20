import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "./schema";
import path from "path";

const connectionString = process.env.DATABASE_URL || "";

// max: 1 keeps this serverless-friendly (Vercel/Neon): each function
// invocation only ever needs a single connection at a time. On a
// long-running server (Railway/VPS) this still works fine, just with less
// connection reuse than a bigger pool would give.
//
// Note: postgres-js does not connect eagerly here — the actual TCP
// connection only happens on the first query. That's intentional: this
// module gets imported during Next.js's build-time page-data collection
// (e.g. for /_not-found), and we don't want the build to require a live
// database connection. Migrations run separately, once, at real server
// startup — see src/instrumentation.ts.
const queryClient = postgres(connectionString, { max: 1 });
export const db = drizzle(queryClient, { schema });
export { schema };

let migratePromise: Promise<void> | null = null;
export function ensureMigrated() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "Falta la variable de entorno DATABASE_URL. Configúrala con la cadena de conexión de tu base de datos Postgres (ej. de Neon)."
    );
  }
  if (!migratePromise) {
    migratePromise = migrate(db, {
      migrationsFolder: path.join(process.cwd(), "drizzle"),
    });
  }
  return migratePromise;
}
