import type { Metadata } from "next";
import Link from "next/link";
import { routes, sharedOpenGraph } from "@/config";

const description =
  "What Jarso collects about parents and children during the pilot, why, who can see it, how long it is kept, and how to have it deleted.";

export const metadata: Metadata = {
  title: "Privacy notice",
  description,
  alternates: { canonical: routes.privacy },
  openGraph: {
    ...sharedOpenGraph,
    title: "Privacy notice · Jarso",
    description,
    url: routes.privacy,
  },
};

const UPDATED = "31 October 2026";

const sections: { heading: string; body: string[] }[] = [
  {
    heading: "What Jarso is",
    body: [
      "Jarso is a pocket-money app for families with children aged 11 to 14, run as a small pilot. A parent sets an allowance, hands it over in cash, and the child plans it across a Spend jar and a Save jar, records purchases, asks for money and learns from short daily missions. No real money moves through Jarso: it keeps the record of money the family handles itself.",
      "This notice says what Jarso stores, why, who can see it and for how long. It is written for the pilot and will be reviewed by a lawyer before Jarso opens to families beyond it.",
    ],
  },
  {
    heading: "About a parent",
    body: [
      "Your email address and a password, to sign in. Your name if you choose to give one.",
      "Your date of birth, country and gender, asked once before you use the app. The date of birth confirms you are an adult; the country and gender help us understand who the pilot reached. Only you can see these details, and they are deleted with your account.",
      "A record of the changes you make for your family (for example adding a child, changing an allowance or resetting a PIN), so that every parent in the family can see what was done and when.",
    ],
  },
  {
    heading: "About a child",
    body: [
      "A nickname the child or parent chooses, and a PIN the child signs in with. The PIN is stored only in scrambled form that cannot be turned back into the PIN.",
      "That is all we ask for. We do not collect a child's name, email address, date of birth, photo, phone number, location or contacts. A child's sign-in is tied to a technical account that has no real email address.",
      "A child cannot use Jarso until a parent has approved them, and a parent can only ever see children linked to their own family.",
    ],
  },
  {
    heading: "The family's money records",
    body: [
      "The family's currency and time zone, the allowance schedule, each handover a parent confirms, purchases the child records with the short label they type, money put into or taken out of Save, extra-money requests with the reason given, savings goals and the money rules a parent sets.",
      "These are the record the app exists to keep, so they are kept while the family uses Jarso. Amounts are what the family entered; nothing is linked to a bank or card.",
    ],
  },
  {
    heading: "Learning",
    body: [
      "Which missions and practice questions a child did, whether they got them right and how many hints they used, so Jarso can choose the next step and show progress. The answers themselves are not kept, and learning progress is never shown next to money.",
    ],
  },
  {
    heading: "Jarso's AI helper",
    body: [
      "If a child uses Ask Jarso, their messages are sent to Anthropic, the company behind the Claude AI model, to produce answers, together with the child's own money and learning details that Jarso looks up to answer the question. Contact details are removed from a message before it is stored or sent. Anthropic handles these under its commercial terms and does not use them for advertising.",
      "Chats are stored with the child's account so their parent can read them. Message text is deleted after 30 days. Jarso may remember a few short facts a child shares about their interests or plans, for up to 90 days; both the child and the parent can see these and delete any of them at any time.",
      "A parent can turn the AI helper off for their child at any time. If a message suggests a child may be at risk, the message itself is never stored.",
    ],
  },
  {
    heading: "Notifications",
    body: [
      "Notices such as an allowance falling due or a request waiting for an answer are stored with the account they are for, so the inbox keeps them between visits.",
      'If you turn on pings for a browser, Jarso stores that browser\'s push address and the browser family (such as "Chrome on Android") so it can send the same notice there. Turn pings off and the address is deleted.',
    ],
  },
  {
    heading: "Keeping accounts safe",
    body: [
      "To stop guessing and misuse, Jarso counts sign-in attempts and invitations per device and per email address for a short while. These counters store only a scrambled form of the address, never the address itself.",
      "Server logs record which account did what, by identifier only. They do not contain names, messages, labels or amounts.",
    ],
  },
  {
    heading: "Who can see what",
    body: [
      "A child sees only their own money and learning. A parent sees the children in their family, including their chats with Jarso's AI. One family can never see another's. Every rule is enforced on the server, not just in the app.",
      "Nobody else sees family data. Jarso has no advertising, no trackers and no analytics scripts, and it never sells or shares data.",
    ],
  },
  {
    heading: "Where it is kept",
    body: [
      "Jarso runs on servers provided by Vercel and Supabase. Messages to the AI helper go to Anthropic. If a child starts onboarding by giving a parent's email address, that address is used only to send the invitation and is removed once the parent joins; invitations expire after seven days.",
    ],
  },
  {
    heading: "How long, and deleting",
    body: [
      "Money records stay while the family uses Jarso. AI chat text goes after 30 days and remembered facts after 90. Rate-limit counters and expired invitations are cleared regularly.",
      "A parent can remove a child from the family at any time. If the child has no money history yet, their sign-in is deleted outright; otherwise their sign-in is closed and the record stays with the family. To delete a parent account and everything in a family, or to ask for a copy of your family's data, contact the pilot team who invited you, and it will be done within 30 days.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <article className="mx-auto grid w-full max-w-2xl gap-8 px-4 py-10 sm:px-6">
      <header className="grid gap-3">
        <p className="eyebrow">Jarso</p>
        <h1 className="text-balance text-display">Privacy notice</h1>
        <p className="text-ink-2 text-lg">
          What Jarso keeps about your family during the pilot, why, who can see it, and for how
          long.
        </p>
        <p className="text-ink-2 text-sm">Last updated {UPDATED}.</p>
      </header>
      {sections.map((section) => (
        <section key={section.heading} className="grid gap-3">
          <h2 className="text-h2">{section.heading}</h2>
          {section.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>
      ))}
      <p>
        Read how the AI helper keeps children safe on the{" "}
        <Link
          href={routes.safety}
          className="font-semibold text-primary underline underline-offset-4"
        >
          safety page
        </Link>
        .
      </p>
      <p>
        <Link
          href={routes.home}
          className="font-semibold text-primary underline underline-offset-4"
        >
          Back to Jarso
        </Link>
      </p>
    </article>
  );
}
