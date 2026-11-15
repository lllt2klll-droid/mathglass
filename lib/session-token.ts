import { COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/config/site";

const encoder = new TextEncoder();

function secretValue(): string {
  const configured = process.env.MATHGLASS_SESSION_SECRET;
  if (configured && configured.length >= 16) return configured;
  // Development fallback keeps local setup frictionless. Production check is
  // surfaced in /api/health and documented in DEPLOYMENT.md.
  return "mathglass-development-session-secret-do-not-use-in-production";
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function importKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secretValue()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signOwnerId(ownerId: string): Promise<string> {
  const key = await importKey();
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(ownerId));
  return `${ownerId}.${base64Url(new Uint8Array(signature))}`;
}

export interface SessionParseResult {
  valid: boolean;
  ownerId: string | null;
}

export async function parseSessionValue(value: string | undefined | null): Promise<SessionParseResult> {
  if (!value) return { valid: false, ownerId: null };
  const separator = value.lastIndexOf(".");
  if (separator <= 0) return { valid: false, ownerId: null };
  const ownerId = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  if (!/^[0-9a-f-]{36}$/i.test(ownerId) || !signature) {
    return { valid: false, ownerId: null };
  }
  const expected = await signOwnerId(ownerId);
  if (expected.length !== value.length) return { valid: false, ownerId: null };
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= expected.charCodeAt(index) ^ value.charCodeAt(index);
  }
  return mismatch === 0 ? { valid: true, ownerId } : { valid: false, ownerId: null };
}

export const sessionCookieOptions = {
  name: COOKIE_NAME,
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
};
