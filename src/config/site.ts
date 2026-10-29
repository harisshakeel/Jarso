import type { Route } from "next";

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
  authConfirm: "/auth/confirm",
  parent: "/parent",
  parentSetup: "/parent/setup",
  parentNewChild: "/parent/children/new",
  parentAllowance: (childId: string) => `/parent/children/${childId}/allowance` as Route,
  parentAllowanceEdit: (childId: string) => `/parent/children/${childId}/allowance/edit` as Route,
  parentGiftNew: (childId: string) => `/parent/children/${childId}/gifts/new` as Route,
  parentGiftEdit: (childId: string, giftId: string) =>
    `/parent/children/${childId}/gifts/${giftId}/edit` as Route,
  parentHandover: (childId: string, kind: "allowance" | "gift", id: string) =>
    `/parent/children/${childId}/handover/${kind}/${id}` as Route,
  child: "/child",
  childStart: "/start",
  childSignIn: "/sign-in/child",
  invite: "/invite",
} as const;

/** Route prefixes that require an authenticated user. Enforced optimistically in proxy, authoritatively in the DAL. */
export const protectedRoutePrefixes = [
  routes.dashboard,
  routes.parent,
  routes.child,
  routes.invite,
] as const;

/** Auth pages that signed-in users should be bounced away from. */
export const authRoutePrefixes = [routes.login, routes.signup] as const;

/** Currencies a family can pick. ISO 4217 codes; money is stored in minor units. */
export const supportedCurrencies = ["GBP", "EUR", "USD", "INR", "AUD", "CAD", "JPY"] as const;
