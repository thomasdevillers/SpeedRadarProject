import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function randomSecret(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashSecret(secret: string): string {
  const pepper = process.env.DEVICE_CREDENTIAL_PEPPER;
  if (!pepper) throw new Error("DEVICE_CREDENTIAL_PEPPER is not configured");
  return createHash("sha256").update(`${pepper}:${secret}`, "utf8").digest("hex");
}

export function safeHashEquals(expectedHex: string, secret: string): boolean {
  const actual = Buffer.from(hashSecret(secret), "hex");
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function safeTextEquals(expected: string, actual: string): boolean {
  const expectedBytes = Buffer.from(expected, "utf8");
  const actualBytes = Buffer.from(actual, "utf8");
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

export function slugify(value: string): string {
  const slug = value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug || `client-${randomBytes(4).toString("hex")}`;
}
