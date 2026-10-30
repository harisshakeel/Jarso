// Every word on the landing page, in one place (spec 2026-10-30-landing-page-design §3).
// Headlines are two beats (design.md §9); the second beat renders muted.

export const landingCopy = {
  // The description is `siteConfig.description` (@/config), shared with the root layout.
  meta: { title: "Jarso · Spend some. Save some." },
  nav: { how: "How it works", safety: "Safety", logIn: "Log in", signUp: "Sign up" },
  hero: {
    title: "Spend some. Save some.",
    line: "Your child plans their pocket money. You stay in the loop.",
    parentCta: "Set up your family",
    kidCta: "I'm a kid",
    captions: [
      "Allowance day.",
      "Split it. Spend and Save.",
      "Save for something real.",
      "Again next week. A bit wiser.",
    ],
  },
  how: {
    eyebrow: "How it works",
    steps: [
      {
        who: "For parents",
        title: ["Due today.", "Hand it over."],
        line: "You hand over the cash. Jarso keeps the record.",
      },
      {
        who: "For kids",
        title: ["Spend some.", "Write it down."],
        line: "Inside the rules you set.",
      },
      {
        who: "For kids",
        title: ["Save some.", "Get there."],
        line: "A goal, a plan, and how many weeks to go.",
      },
      {
        who: "For kids",
        title: ["A mission a day.", "About three minutes."],
        line: "Short, playful lessons on real money choices.",
      },
    ],
  },
  guide: {
    title: ["Stuck? Ask.", "Hints first. Answers after two tries."],
    note: "Off until you turn it on. You can read every chat.",
    link: "How the guide stays safe",
  },
  family: { title: ["Kids plan.", "Parents stay in charge."] },
  safety: {
    lead: "No cards. No bank details. No ads.",
    rest: "The cash stays with you, and you can see every jar, purchase and chat.",
    chips: ["No real payments", "Guide off by default", "Ages 11 to 14"],
  },
  turn: {
    title: ["Your turn.", "Start with this week's pocket money."],
    parentCta: "Set up your family",
    kidCta: "Kids, start here",
  },
  footer: { line: "A pocket-money pilot for families with children aged 11 to 14." },
} as const;
