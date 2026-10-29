import type { Page } from "@playwright/test";

/**
 * Marks the page's Supabase session cookie as expired so the next request must use the refresh
 * token. The app verifies access tokens locally, so a revoked session only shows on refresh.
 * Decodes and re-encodes the @supabase/ssr cookie ("base64-" + base64url JSON, maybe chunked).
 */
export async function expireAccessToken(page: Page): Promise<void> {
  const context = page.context();
  const pattern = /^(sb-.+-auth-token)(?:\.(\d+))?$/;
  const parts = (await context.cookies())
    .flatMap((cookie) => {
      const match = pattern.exec(cookie.name);
      return match ? [{ cookie, base: match[1] ?? "", index: Number(match[2] ?? 0) }] : [];
    })
    .sort((a, b) => a.index - b.index);
  const first = parts[0];
  if (!first) throw new Error("No Supabase session cookie");

  const raw = parts.map((part) => part.cookie.value).join("");
  const session = JSON.parse(Buffer.from(raw.replace(/^base64-/, ""), "base64url").toString());
  session.expires_at = 1;
  const encoded = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;

  await context.clearCookies({ name: pattern });
  const chunks = encoded.match(/.{1,3180}/g) ?? [];
  const { domain, path, sameSite, secure, httpOnly } = first.cookie;
  await context.addCookies(
    chunks.map((value, i) => ({
      name: chunks.length === 1 ? first.base : `${first.base}.${i}`,
      value,
      domain,
      path,
      sameSite,
      secure,
      httpOnly,
    })),
  );
}

/**
 * Reads the family code from the parent's Settings (where it lives), then goes back to Home.
 * Six characters from the unambiguous alphabet.
 */
export async function readFamilyCode(page: Page): Promise<string> {
  await page.goto("/parent/settings");
  const card = page.locator("[data-slot=card]", { hasText: "Give this code to your child" });
  const value = card.getByText(/^[A-Z2-9]{6}$/);
  const code = ((await value.textContent()) ?? "").trim();
  if (!/^[A-Z2-9]{6}$/.test(code)) throw new Error(`Unexpected family code "${code}"`);
  await page.goto("/parent");
  return code;
}
