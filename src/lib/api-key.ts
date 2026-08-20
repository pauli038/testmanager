import { nanoid } from "nanoid";

export function generateApiKey() {
  return `tm_${nanoid(32)}`;
}
