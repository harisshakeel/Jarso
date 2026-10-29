// Pure helpers, isomorphic. Alphabet drops look-alikes (I, O, 0, 1); length 32 divides 256, so byte % 32 is unbiased.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normaliseFamilyCode(input: string): string {
  return input.replace(/[\s-]/g, "").toUpperCase();
}

export function generateCode(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** 256-bit URL-safe random token (hex). */
export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** SHA-256 hex digest. */
export async function hashSecret(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Synthetic, non-deliverable auth email for child accounts. */
export function childEmail(profileId: string): string {
  return `${profileId}@child.jarso.invalid`;
}

/**
 * One limiter key per inbox: lower-cased, with any `+tag` dropped from the local part, so
 * `Parent+1@x.com` and `parent@x.com` share a count. Only ever hashed, never stored or sent.
 */
export function normaliseEmailForLimit(email: string): string {
  const value = email.trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at < 1) return value;
  const local = value.slice(0, at).split("+")[0] || value.slice(0, at);
  return `${local}${value.slice(at)}`;
}
