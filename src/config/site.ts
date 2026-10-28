export const siteConfig = {
  name: "Jarso",
  description: "Jarso",
} as const;

export const routes = {
  home: "/",
  login: "/login",
  signup: "/signup",
  dashboard: "/dashboard",
  authCallback: "/auth/callback",
} as const;

/** Route prefixes that require an authenticated user. Enforced optimistically in proxy, authoritatively in the DAL. */
export const protectedRoutePrefixes = [routes.dashboard] as const;

/** Auth pages that signed-in users should be bounced away from. */
export const authRoutePrefixes = [routes.login, routes.signup] as const;

/** Currencies a family can pick. ISO 4217 codes; money is stored in minor units. */
export const supportedCurrencies = ["GBP", "EUR", "USD", "INR", "AUD", "CAD", "JPY"] as const;
