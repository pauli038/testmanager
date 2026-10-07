import { db } from "@/db";
import { testCases, testSuites } from "@/db/schema";
import { and, eq, inArray, ne, sql } from "drizzle-orm";

export const CODE_MAX_LENGTH = 40;

// "  tc-rf020-06 " → "TC-RF020-06"; empty → null.
export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return code || null;
}

// Letters, digits and - _ . only, so codes stay easy to type, search and
// match from Playwright titles.
export function codeFormatError(code: string): string | null {
  if (code.length > CODE_MAX_LENGTH) return `El código no puede tener más de ${CODE_MAX_LENGTH} caracteres`;
  if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(code))
    return "El código solo puede tener letras, números, guiones, puntos y guiones bajos (sin espacios)";
  return null;
}

// Title of the case in the same project already using `code`, if any.
export async function findCodeOwner(
  projectId: string,
  code: string,
  excludeCaseId?: string
): Promise<{ id: string; title: string } | undefined> {
  const suiteIds = (
    await db.query.testSuites.findMany({
      where: eq(testSuites.projectId, projectId),
      columns: { id: true },
    })
  ).map((s) => s.id);
  if (suiteIds.length === 0) return undefined;
  return db.query.testCases.findFirst({
    where: and(
      inArray(testCases.suiteId, suiteIds),
      sql`upper(${testCases.code}) = ${code}`,
      excludeCaseId ? ne(testCases.id, excludeCaseId) : undefined
    ),
    columns: { id: true, title: true },
  });
}

// Validates a code coming from the API. Returns the normalized code, or an
// error message ready to send back with a 400/409.
export async function validateCode(
  raw: unknown,
  projectId: string,
  excludeCaseId?: string
): Promise<{ code: string | null; error?: string; status?: number }> {
  const code = normalizeCode(raw);
  if (!code) return { code: null };
  const formatError = codeFormatError(code);
  if (formatError) return { code, error: formatError, status: 400 };
  const owner = await findCodeOwner(projectId, code, excludeCaseId);
  if (owner)
    return { code, error: `El código ${code} ya lo usa el caso "${owner.title}"`, status: 409 };
  return { code };
}
