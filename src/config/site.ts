import type { Route } from "next";

/** What search engines and link previews say about Jarso. The landing page copy lives in `@/features/landing`. */
export const siteConfig = {
  name: "Jarso",
  tagline: "Spend some. Save some.",
  description:
    "Pocket money your child plans and you can see. Spend and Save jars, short money missions and a safe AI money guide, for families with children aged 11 to 14.",
  locale: "en_GB",
  keywords: [
    "pocket money app",
    "allowance app for kids",
    "kids money app",
    "money lessons for children",
    "spend and save jars",
    "savings goal for kids",
    "financial literacy for kids",
    "children aged 11 to 14",
  ],
} as const;

/**
 * Open Graph fields every public page repeats: a page's `openGraph` replaces its layout's whole,
 * including the image Next.js takes from `src/app/opengraph-image.png`, so the image is named here.
 */
export const sharedOpenGraph = {
  type: "website",
  siteName: siteConfig.name,
  locale: siteConfig.locale,
  images: [
    {
      url: "/opengraph-image.png",
      width: 1200,
      height: 630,
      alt: "Jarso: Spend some. Save some. Pocket money your child plans, you stay in the loop. A Spend jar with a few coins and a Save jar filled three quarters with coins.",
    },
  ],
};

/** Public pages for the sitemap, with the date their content last changed (`YYYY-MM-DD`). */
export const publicPages = [
  { path: "/", updated: "2026-10-30", priority: 1 },
  { path: "/safety", updated: "2026-10-30", priority: 0.6 },
] as const;

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
  /** Diary: purchases, history and undo (FR04). */
  childDiary: "/child/diary" as Route,
  /** Learn: the seven-day journey (FR06). */
  childLearn: "/child/learn" as Route,
  /** The weekly review (FR11) and its one fresh question. */
  childWeek: "/child/learn/week" as Route,
  childWeekQuestion: "/child/learn/week/question" as Route,
  childMission: (missionKey: string) => `/child/learn/${missionKey}` as Route,
  childCheckIn: "/child/learn/check-in" as Route,
  childPractice: "/child/learn/practice" as Route,
  /** A topic page (FR08); `from` is the mission to return to. */
  childTopic: (topicKey: string, from?: string) =>
    `/child/learn/topics/${topicKey}${from ? `?from=${encodeURIComponent(from)}` : ""}` as Route,
  /** Take out and put in: the child's savings requests. */
  childRequests: "/child/requests" as Route,
  childStart: "/start",
  childSignIn: "/sign-in/child",
  invite: "/invite",
  settings: "/settings",
  parentSettings: "/parent/settings",
  childSettings: "/child/settings",
  /** The in-app inbox (FR16). The pages arrive after the server module. */
  childInbox: "/child/inbox" as Route,
  parentInbox: "/parent/inbox" as Route,
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
