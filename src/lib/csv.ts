// Helpers for bulk-importing test cases from a CSV file.
// Shared between the client (parsing the uploaded file) and the import API
// route (normalizing priority/type values before writing to the DB).

export function parseCsv(input: string): string[][] {
  let text = input;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM (Excel exports)

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\r") {
      // skip, \n handles the line break
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

export type ImportedStep = { step: string; expected: string };

export type ImportedCaseRow = {
  title: string;
  preconditions?: string;
  priority?: string;
  type?: string;
  tags?: string;
  automated?: boolean;
  automationId?: string;
  steps?: ImportedStep[];
};

const HEADER_ALIASES: Record<string, keyof ImportedCaseRow> = {
  titulo: "title",
  "título": "title",
  title: "title",
  precondiciones: "preconditions",
  "precondición": "preconditions",
  preconditions: "preconditions",
  prioridad: "priority",
  priority: "priority",
  tipo: "type",
  type: "type",
  tags: "tags",
  etiquetas: "tags",
  automatizado: "automated",
  automated: "automated",
  id_automatizacion: "automationId",
  "id_automatización": "automationId",
  automationid: "automationId",
  automation_id: "automationId",
  pasos: "steps",
  steps: "steps",
};

export function parseSteps(raw: string): ImportedStep[] {
  if (!raw.trim()) return [];
  return raw
    .split("|")
    .map((chunk) => {
      const [step, expected] = chunk.split("::");
      return { step: (step || "").trim(), expected: (expected || "").trim() };
    })
    .filter((s) => s.step || s.expected);
}

export function rowsToCases(rows: string[][]): ImportedCaseRow[] {
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const fieldByCol = header.map((h) => HEADER_ALIASES[h]);

  const out: ImportedCaseRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r];
    if (cols.every((c) => !c.trim())) continue;

    const obj: ImportedCaseRow = { title: "" };
    fieldByCol.forEach((field, idx) => {
      if (!field) return;
      const raw = (cols[idx] || "").trim();
      if (field === "automated") {
        obj.automated = /^(si|sí|true|1|yes|x)$/i.test(raw);
      } else if (field === "steps") {
        obj.steps = parseSteps(raw);
      } else if (raw) {
        (obj as unknown as Record<string, string>)[field] = raw;
      }
    });
    if (obj.title.trim()) out.push(obj);
  }
  return out;
}

const PRIORITY_ALIASES: Record<string, string> = {
  baja: "low",
  low: "low",
  media: "medium",
  medium: "medium",
  normal: "medium",
  alta: "high",
  high: "high",
  critica: "critical",
  "crítica": "critical",
  critical: "critical",
};

export function normalizePriority(v?: string): "low" | "medium" | "high" | "critical" {
  const k = (v || "").trim().toLowerCase();
  return (PRIORITY_ALIASES[k] as "low" | "medium" | "high" | "critical") || "medium";
}

const TYPE_ALIASES: Record<string, string> = {
  funcional: "functional",
  functional: "functional",
  regresion: "regression",
  "regresión": "regression",
  regression: "regression",
  smoke: "smoke",
  e2e: "e2e",
  api: "api",
  otro: "other",
  other: "other",
};

export function normalizeType(
  v?: string
): "functional" | "regression" | "smoke" | "e2e" | "api" | "other" {
  const k = (v || "").trim().toLowerCase();
  return (
    (TYPE_ALIASES[k] as "functional" | "regression" | "smoke" | "e2e" | "api" | "other") ||
    "functional"
  );
}

export const CSV_TEMPLATE = `titulo,precondiciones,prioridad,tipo,tags,automatizado,id_automatizacion,pasos
Login con credenciales validas,Usuario registrado,alta,smoke,login,si,"LoginTest > should log in with valid credentials","Ir a la pantalla de login::Se muestra el formulario|Ingresar usuario y clave validos y enviar::Se redirige al dashboard"
Login con clave incorrecta,Usuario registrado,media,functional,login,no,,"Ingresar clave incorrecta::Se muestra un mensaje de error"
`;
