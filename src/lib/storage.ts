// Evidence files in a private Supabase Storage bucket, through its REST API.
// Configured with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (server only,
// never sent to the browser); SUPABASE_STORAGE_BUCKET defaults to
// "attachments". Without them, files keep being stored in the database.

const BASE_URL = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "attachments";

export function storageEnabled() {
  return Boolean(BASE_URL && KEY);
}

function objectUrl(kind: "object" | "object/sign", path: string) {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${BASE_URL}/storage/v1/${kind}/${encodeURIComponent(BUCKET)}/${encoded}`;
}

function headers(extra: Record<string, string> = {}) {
  return { Authorization: `Bearer ${KEY}`, apikey: KEY!, ...extra };
}

async function fail(action: string, res: Response): Promise<never> {
  const body = await res.text().catch(() => "");
  throw new Error(`Storage: no se pudo ${action} (HTTP ${res.status}) ${body.slice(0, 300)}`);
}

export async function uploadObject(path: string, data: Buffer, contentType: string) {
  const res = await fetch(objectUrl("object", path), {
    method: "POST",
    headers: headers({ "Content-Type": contentType, "x-upsert": "true" }),
    body: new Uint8Array(data),
  });
  if (!res.ok) await fail(`subir ${path}`, res);
}

export async function downloadObject(path: string): Promise<Buffer> {
  const res = await fetch(objectUrl("object", path), { headers: headers() });
  if (!res.ok) await fail(`leer ${path}`, res);
  return Buffer.from(await res.arrayBuffer());
}

// Temporary link to the file, so the browser downloads it straight from the
// bucket (no size limit of a serverless response in between).
export async function signedUrl(path: string, expiresInSeconds: number): Promise<string> {
  const res = await fetch(objectUrl("object/sign", path), {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({ expiresIn: expiresInSeconds }),
  });
  if (!res.ok) await fail(`firmar ${path}`, res);
  const { signedURL } = (await res.json()) as { signedURL: string };
  return `${BASE_URL}/storage/v1${signedURL}`;
}

export async function deleteObjects(paths: string[]) {
  if (paths.length === 0) return;
  const res = await fetch(`${BASE_URL}/storage/v1/object/${encodeURIComponent(BUCKET)}`, {
    method: "DELETE",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({ prefixes: paths }),
  });
  if (!res.ok) await fail("borrar archivos", res);
}
