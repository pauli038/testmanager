// Helpers to link a Playwright result to an existing test case even when the
// test's title isn't a character-for-character copy of the case's title.

// Test codes like "TC-RF020-06", "TC-CAT-023", "TC-RNF005-01" or "RN-044".
// "RF-002" alone is left out on purpose: it names a whole requirement (often
// a describe block), not a single case.
const CODE_RE = /\b(?:TC|RN)-[A-Z0-9]+(?:-\d+)?\b/gi;

export function extractCodes(text: string): string[] {
  return [...new Set([...text.matchAll(CODE_RE)].map((m) => m[0].toUpperCase()))];
}

// Lowercase, no accents, no test codes, punctuation collapsed to spaces, so
// "fecha final en sábado (TC-RF020-06)" and "Fecha final en sabado" compare
// equal.
export function normalizeTitle(title: string): string {
  return title
    .replace(CODE_RE, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Codes a case is known by: its code field plus those in its tags,
// automationId and title.
export function caseCodes(c: {
  code?: string | null;
  tags: string;
  automationId: string | null;
  title: string;
}): Set<string> {
  const codes = new Set(extractCodes(`${c.tags} ${c.automationId ?? ""} ${c.title}`));
  if (c.code) codes.add(c.code.toUpperCase());
  return codes;
}

// True when `code` appears in `text` as a whole token ("TC-RF020-06" in
// "fecha final (TC-RF020-06)" but not in "TC-RF020-061"). Works for any code
// format, not only TC-/RN- ones.
export function mentionsCode(text: string, code: string): boolean {
  const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`, "i").test(text);
}

// Appends codes to a comma-separated tag list, skipping ones already there.
export function addCodesToTags(tags: string, codes: string[]): string {
  const current = tags.split(",").map((t) => t.trim()).filter(Boolean);
  const have = new Set(current.map((t) => t.toUpperCase()));
  return [...current, ...codes.filter((c) => !have.has(c.toUpperCase()))].join(", ");
}
