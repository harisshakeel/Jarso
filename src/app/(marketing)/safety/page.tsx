import type { Metadata } from "next";
import Link from "next/link";
import { helplineDirectory, pilotHelplines, routes, sharedOpenGraph } from "@/config";

const description =
  "How Jarso's AI money guide keeps children safe: what it does, what it never does, and what is kept.";

export const metadata: Metadata = {
  title: "Money guide safety",
  description,
  alternates: { canonical: routes.safety },
  openGraph: {
    ...sharedOpenGraph,
    title: "Money guide safety · Jarso",
    description,
    url: routes.safety,
  },
};

const sections: { heading: string; body: string[] }[] = [
  {
    heading: "It is an AI, and it says so",
    body: [
      "Jarso's money guide is an AI helper built on Claude, made by Anthropic. It is a computer program, not a person, and it can get things wrong.",
      'Before a child\'s first message it shows a card that says so, and every reply carries an "AI guide" label. It has no name, no feelings and no life outside the app, and it never acts as a friend.',
    ],
  },
  {
    heading: "Off until a parent turns it on",
    body: [
      "The guide is off for every child. A parent turns it on for each child from that child's page. Turning it on is the parent's consent for the child's messages to be sent to Anthropic to get answers.",
      "A parent can turn it off at any time. The child is told, before their first message, that their parent can see their chats.",
    ],
  },
  {
    heading: "What it helps with",
    body: [
      "Jarso's money topics: spending within your balance, splitting an allowance between Spend and Save, saving toward a goal, tradeoffs, and changing a plan. It also answers basic money questions in plain words.",
      "In a mission it helps a child think: a guiding question first, then hints. It gives an answer only after the child has tried twice.",
    ],
  },
  {
    heading: "What it never does",
    body: [
      "It never asks for personal or account details. It never recommends products, brands, shops, apps or investments, and never tells a child to buy anything. It never comments on how much money a child or family has.",
      "Questions about other things get a short, friendly redirect to a money topic.",
    ],
  },
  {
    heading: "Three checks on every message",
    body: [
      "Contact details such as emails, phone numbers and links are removed from a message before it is stored or sent.",
      "A separate safety check reads each message first. Off-topic, personal, unsafe or rule-breaking messages get a fixed, reviewed reply instead of the AI's answer.",
      "Another check reads every AI reply before the child sees it, and holds it back if it breaks any of the rules above. There are limits on how many messages a child can send.",
    ],
  },
  {
    heading: "If a child seems unsafe",
    body: [
      "If a message suggests a child may be hurt, scared or at risk, the guide does not answer with the AI. It shows a kind, fixed message that encourages the child to talk to an adult they trust, lists free helplines (below), and says to call the local emergency number if they are in danger right now.",
      "The chat is flagged for the parent. The parent sees that a safety response was shown, but not the child's message: it is never stored, so a child can reach out safely. If the safety check can't run, a simple keyword check still shows the helplines.",
    ],
  },
  {
    heading: "What is kept, and for how long",
    body: [
      "Chats are stored with the child's account so their parent can read them. Message text is deleted after 30 days. What remains is a record of when a message was sent, how it was handled and how many words it took, used for safety and cost.",
      "Messages are sent to Anthropic to produce answers and are handled under Anthropic's commercial terms. Nothing is used for advertising.",
    ],
  },
];

export default function SafetyPage() {
  return (
    <article className="mx-auto grid w-full max-w-2xl gap-8 px-4 py-10 sm:px-6">
      <header className="grid gap-3">
        <p className="eyebrow">Jarso</p>
        <h1 className="text-balance text-display">The money guide. Safe by design.</h1>
        <p className="text-ink-2 text-lg">
          How Jarso's AI money guide works for children aged 11 to 14, what it will and won't do,
          and what we keep.
        </p>
      </header>
      {sections.map((section) => (
        <section key={section.heading} className="grid gap-3">
          <h2 className="text-h2">{section.heading}</h2>
          {section.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>
      ))}
      <section aria-labelledby="helplines" className="grid gap-3">
        <h2 id="helplines" className="text-h2">
          Helplines the guide shows
        </h2>
        {pilotHelplines.map((group) => (
          <div key={group.country} className="grid gap-1">
            <h3 className="font-bold">{group.country}</h3>
            <ul className="grid gap-1">
              {group.lines.map((line) => (
                <li key={line.name}>
                  <a
                    href={line.url}
                    className="font-semibold text-primary underline underline-offset-4"
                  >
                    {line.name}
                  </a>
                  : {line.contact}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p>
          Everywhere else:{" "}
          <a
            href={helplineDirectory.url}
            className="font-semibold text-primary underline underline-offset-4"
          >
            {helplineDirectory.name}
          </a>
          , {helplineDirectory.contact.toLowerCase()}.
        </p>
      </section>
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
