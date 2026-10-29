import type { Route } from "next";

export const siteConfig = {
  name: "Jarso",
  description: "Jarso",
} as const;

export const routes = {
  home: "/",
  /** Public: how the AI guide keeps children safe (spec §5, G3). */
  safety: "/safety" as Route,
  login: "/login",
  signup: "/signup",
  dashboard: "/dashboard",
  authCallback: "/auth/callback",
  authConfirm: "/auth/confirm",
  parent: "/parent",
  parentSetup: "/parent/setup",
  parentNewChild: "/parent/children/new",
  /** The Allowance tab: every child's allowance at a glance. */
  parentAllowanceOverview: "/parent/allowance" as Route,
  parentChild: (childId: string) => `/parent/children/${childId}` as Route,
  parentChildHistory: (childId: string) => `/parent/children/${childId}/history` as Route,
  parentAllowance: (childId: string) => `/parent/children/${childId}/allowance` as Route,
  parentAllowanceEdit: (childId: string) => `/parent/children/${childId}/allowance/edit` as Route,
  parentRules: (childId: string) => `/parent/children/${childId}/rules` as Route,
  parentGiftNew: (childId: string) => `/parent/children/${childId}/gifts/new` as Route,
  parentGiftEdit: (childId: string, giftId: string) =>
    `/parent/children/${childId}/gifts/${giftId}/edit` as Route,
  parentHandover: (childId: string, kind: "allowance" | "gift", id: string) =>
    `/parent/children/${childId}/handover/${kind}/${id}` as Route,
  parentChildLearning: (childId: string) => `/parent/children/${childId}/learning` as Route,
  /** The parent's view of a child's guide chats (ADR 0010). */
  parentChildGuide: (childId: string) => `/parent/children/${childId}/guide` as Route,
  parentChildGuideChat: (childId: string, conversationId: string) =>
    `/parent/children/${childId}/guide/${conversationId}` as Route,
  child: "/child",
  /** Learn: the seven-day journey (FR06). */
  childLearn: "/child/learn" as Route,
  childMission: (missionKey: string) => `/child/learn/${missionKey}` as Route,
  childCheckIn: "/child/learn/check-in" as Route,
  childPractice: "/child/learn/practice" as Route,
  /** A topic page (FR08); `from` is the mission to return to. */
  childTopic: (topicKey: string, from?: string) =>
    `/child/learn/topics/${topicKey}${from ? `?from=${encodeURIComponent(from)}` : ""}` as Route,
  childStart: "/start",
  childSignIn: "/sign-in/child",
  invite: "/invite",
  settings: "/settings",
  parentSettings: "/parent/settings",
  childSettings: "/child/settings",
} as const;

/** Route prefixes that require an authenticated user. Enforced optimistically in proxy, authoritatively in the DAL. */
export const protectedRoutePrefixes = [
  routes.dashboard,
  routes.parent,
  routes.child,
  routes.invite,
  routes.settings,
] as const;

/** Auth pages that signed-in users should be bounced away from. */
export const authRoutePrefixes = [routes.login, routes.signup] as const;

/** Currencies a family can pick. ISO 4217 codes; money is stored in minor units. */
export const supportedCurrencies = ["GBP", "EUR", "USD", "INR", "AUD", "CAD", "JPY"] as const;
