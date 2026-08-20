// Runs once when a new server instance actually starts (both in a
// long-running server like Railway/VPS, and per cold start on Vercel's
// serverless functions) — unlike module imports, this does NOT run during
// `next build`'s static page-data collection, so it's the right place to
// apply database migrations without requiring a DB connection at build time.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureMigrated } = await import("@/db");
    await ensureMigrated();
  }
}
