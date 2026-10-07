// Shared by the server and the import dialog (no database imports here).

// "rf20", "RF-020", "RF 020", "rf_20" → "RF-020"; "cat" → "CAT".
// Numbers are padded to 3 digits so the requirement list and the case codes
// (TC-RF020-06) agree however each one was typed. Anything else → null.
export function normalizeRequirementKey(raw: string): string | null {
  const s = raw.trim().toUpperCase().replace(/\s+/g, "");
  const numbered = s.match(/^([A-Z]+)[-_.]?(\d{1,4})$/);
  if (numbered) return `${numbered[1]}-${numbered[2].padStart(3, "0")}`;
  if (/^[A-Z]{2,10}$/.test(s)) return s;
  return null;
}

// Requirement a case code belongs to:
//   "TC-RF020-06"  → "RF-020"
//   "TC-RNF005-01" → "RNF-005"
//   "TC-CAT-023"   → "CAT"
// Codes that don't follow the TC-<requirement>-<n> shape have none.
export function requirementOf(code: string | null | undefined): string | null {
  const m = code?.toUpperCase().match(/^TC-([A-Z]+\d*)-[A-Z0-9]+$/);
  return m ? normalizeRequirementKey(m[1]) : null;
}

export type RequirementRow = { key: string; title: string | null };

const KEY_HEADERS = ["requisito", "requerimiento", "codigo", "código", "id", "clave", "key"];
const TITLE_HEADERS = ["titulo", "título", "nombre", "descripcion", "descripción", "title", "detalle"];

// Turns spreadsheet rows (CSV/Excel) into requirements. Uses the header row
// when it names the columns; otherwise the first column is the key and the
// second the title. Rows whose key isn't valid are returned in `invalid`.
export function rowsToRequirements(rows: string[][]): {
  items: RequirementRow[];
  invalid: string[];
} {
  const clean = rows.filter((r) => r.some((c) => c.trim()));
  if (clean.length === 0) return { items: [], invalid: [] };

  const header = clean[0].map((h) => h.trim().toLowerCase());
  let keyCol = header.findIndex((h) => KEY_HEADERS.includes(h));
  let titleCol = header.findIndex((h) => TITLE_HEADERS.includes(h));
  const hasHeader = keyCol >= 0;
  if (!hasHeader) {
    keyCol = 0;
    titleCol = 1;
  }

  const items = new Map<string, RequirementRow>();
  const invalid: string[] = [];
  for (const row of hasHeader ? clean.slice(1) : clean) {
    const rawKey = (row[keyCol] ?? "").trim();
    if (!rawKey) continue;
    const key = normalizeRequirementKey(rawKey);
    if (!key) {
      invalid.push(rawKey);
      continue;
    }
    const title = titleCol >= 0 ? (row[titleCol] ?? "").trim() || null : null;
    items.set(key, { key, title: title ?? items.get(key)?.title ?? null });
  }
  return { items: [...items.values()], invalid };
}

// Pasted text, one requirement per line: "RF-001 Registro de compras",
// "RF-001: Registro…", "RF-001<TAB>Registro…" (copied from Excel) or just "RF-001".
export function textToRequirements(text: string) {
  const rows = text
    .split(/\r?\n/)
    .map((line) => {
      const tab = line.split("\t");
      if (tab.length > 1) return [tab[0], tab.slice(1).join(" ")];
      // Key first: "RF-001" / "RF 001" / "rf001", or an all-caps module
      // name like "CAT". A lowercase word ("basura") isn't taken as a key.
      const m = line
        .trim()
        .match(/^([A-Za-z]+(?:[-_.]|\s)?\d{1,4}|[A-Z]{2,10})(?=$|[\s:;,–-])[\s:;,–-]*(.*)$/);
      return m ? [m[1], m[2]] : [line.trim()];
    });
  return rowsToRequirements(rows);
}
