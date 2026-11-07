import { normaliseFamilyCode } from "./codes";
import { addChildSchema } from "./schemas";

/**
 * What the parent's share card QR carries: the family code and the child's nickname, nothing
 * else. Never the PIN or any token: a leaked QR shows what the printed card shows, and the PIN
 * (rate limited, locked after wrong tries) still guards the account.
 */
export type ChildSignInLink = { familyCode: string; nickname: string };

/** The app's own scheme and the child sign-in route; the stock camera opens the app there. */
const PREFIX = "jarso://sign-in?";

/** Family codes after normalisation: letters and digits, as many as the sign-in form takes. */
const CODE = /^[A-Z0-9]{4,16}$/;

/** `jarso://sign-in?code=…&nickname=…` for the share card's QR and message. */
export function childSignInLink({ familyCode, nickname }: ChildSignInLink): string {
  const code = encodeURIComponent(normaliseFamilyCode(familyCode));
  return `${PREFIX}code=${code}&nickname=${encodeURIComponent(nickname)}`;
}

/** The query's values by name, first one wins; null when a value can't be decoded. */
function readQuery(query: string): Map<string, string> | null {
  const values = new Map<string, string>();
  for (const pair of query.split("&")) {
    const at = pair.indexOf("=");
    if (at < 1) continue;
    const key = pair.slice(0, at);
    if (values.has(key)) continue;
    try {
      values.set(key, decodeURIComponent(pair.slice(at + 1).replace(/\+/g, " ")));
    } catch {
      return null;
    }
  }
  return values;
}

/**
 * A scanned or opened link back into the two sign-in fields, or null when it is not a Jarso
 * child sign-in link. Strict: only this scheme and path, a well-formed code and a nickname the
 * nickname rule accepts. Anything else in the link (a `pin`, a `next`) is ignored, so a crafted
 * QR can neither redirect nor fill in a PIN.
 */
export function parseChildSignInLink(text: string): ChildSignInLink | null {
  const value = text.trim();
  if (!value.startsWith(PREFIX)) return null;
  const query = readQuery(value.slice(PREFIX.length));
  const code = query?.get("code");
  const nickname = addChildSchema.shape.nickname.safeParse(query?.get("nickname") ?? "");
  if (!code || !nickname.success) return null;
  const familyCode = normaliseFamilyCode(code);
  if (!CODE.test(familyCode)) return null;
  return { familyCode, nickname: nickname.data };
}
