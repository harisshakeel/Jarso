import { moneyAmounts } from "@jarso/core/learning";
import type { ReactNode } from "react";
import { JarArt } from "@/components/brand";
import { formatMoney } from "@/lib";
import { Chip, Coin } from "./lesson-film/film-scenes";

// A still picture above a question (design.md §6, "Question picture"): the situation the words
// describe, drawn with the lesson films' jar and coins, so a child who finds word problems hard
// can see it. Only the setup, never the working: a "?" sits where the answer goes, because the
// check-in places a child and must measure them, not the picture. Amounts come from the
// question's own money tokens, in the family's currency, so the picture never disagrees with it.

export type StepPicture = {
  /** What the picture shows, with the question's amounts, for screen readers. */
  label: (money: readonly string[]) => string;
  Picture: (props: { money: readonly string[] }) => ReactNode;
};

const VIEWBOX = "0 0 1000 360";
const JAR_Y = 210;
const JAR_SCALE = 0.32;
const LABEL_Y = 340;

const at = (money: readonly string[], i: number) => money[i] ?? "";

function Label({ x, text }: { x: number; text: string }) {
  return (
    <text x={x} y={LABEL_Y} textAnchor="middle" fontSize={28} className="fill-foreground font-bold">
      {text}
    </text>
  );
}

function Arrow({ d }: { d: string }) {
  return (
    <g
      fill="none"
      strokeWidth={7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="stroke-ink-2"
    >
      <path d={d} strokeDasharray="2 16" />
    </g>
  );
}

/** A small "?" badge where the answer would go. */
function Ask({ x, y, size = 26 }: { x: number; y: number; size?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={size} className="fill-primary" />
      <text
        y={size * 0.38}
        textAnchor="middle"
        fontSize={size * 1.15}
        className="fill-primary-foreground font-extrabold"
      >
        ?
      </text>
    </g>
  );
}

function Book({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(-6)`} strokeWidth={6} strokeLinejoin="round">
      <rect
        x={-56}
        y={-72}
        width={112}
        height={144}
        rx={10}
        className="fill-cyan-300 stroke-teal-800"
      />
      <path d="M-40 -72 V72" className="stroke-teal-800" />
      <path d="M-20 -36 H36 M-20 -12 H28" strokeLinecap="round" className="stroke-teal-800" />
    </g>
  );
}

function Gamepad({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} strokeWidth={6} strokeLinejoin="round">
      <rect
        x={-86}
        y={-46}
        width={172}
        height={92}
        rx={46}
        className="fill-teal-200 stroke-teal-800"
      />
      <path d="M-50 -16 V16 M-66 0 H-34" strokeLinecap="round" className="stroke-teal-800" />
      <circle cx={42} cy={-10} r={10} className="fill-teal-800" />
      <circle cx={62} cy={12} r={10} className="fill-teal-800" />
    </g>
  );
}

function Snack({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} strokeWidth={6} strokeLinejoin="round">
      <path d="M-46 -62 H46 L38 62 H-38 Z" className="fill-teal-100 stroke-teal-800" />
      <path d="M-46 -62 L-40 -76 H40 L46 -62" className="fill-cyan-300 stroke-teal-800" />
      <circle cy={8} r={20} className="fill-cyan-300 stroke-teal-800" />
    </g>
  );
}

/** A football: the goal being saved for. */
function Ball({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} strokeWidth={6} strokeLinejoin="round">
      <circle r={66} className="fill-card stroke-teal-800" />
      <path d="M0 -24 L23 -7 L14 20 H-14 L-23 -7 Z" className="fill-teal-800 stroke-teal-800" />
      <path
        d="M0 -24 V-64 M23 -7 L62 -20 M14 20 L38 54 M-14 20 L-38 54 M-23 -7 L-62 -20"
        className="stroke-teal-800"
      />
    </g>
  );
}

/** A calendar page with a "?" for the number of weeks. */
function Calendar({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} strokeWidth={6} strokeLinejoin="round">
      <rect
        x={-70}
        y={-70}
        width={140}
        height={150}
        rx={16}
        className="fill-card stroke-teal-800"
      />
      <path d="M-70 -30 H70" className="stroke-teal-800" />
      <rect x={-70} y={-70} width={140} height={40} rx={16} className="fill-teal-700" />
      <path d="M-34 -84 V-58 M34 -84 V-58" strokeLinecap="round" className="stroke-teal-800" />
      <text y={52} textAnchor="middle" fontSize={64} className="fill-primary font-extrabold">
        ?
      </text>
    </g>
  );
}

/** A small stack of coins: money arriving. */
function CoinStack({ x, y }: { x: number; y: number }) {
  return (
    <>
      {[0, 1, 2, 3].map((level) => (
        <Coin key={level} x={x} y={y - level * 16} />
      ))}
    </>
  );
}

export const stepPictures: Readonly<Partial<Record<string, StepPicture>>> = {
  // "You have 14 in Spend. You buy a book for 5.50. How much is left?"
  "checkin-spending": {
    label: (m) => `A Spend jar with ${at(m, 0)} in it, and a book with a price tag of ${at(m, 1)}.`,
    Picture: ({ money }) => (
      <>
        <JarArt cx={280} cy={JAR_Y} scale={JAR_SCALE} tone="spend" coins={8} />
        <Chip x={280} y={52} text={at(money, 0)} pop={1} gold size={30} />
        <Label x={280} text="Spend" />
        <Arrow d="M420 200 H580" />
        <Book x={730} y={200} />
        <Chip x={730} y={52} text={at(money, 1)} pop={1} size={30} />
      </>
    ),
  },
  // "You get 10 and put 4 in Save. How much goes to Spend?"
  "checkin-splitting": {
    label: (m) =>
      `${at(m, 0)} arriving, split between a Spend jar marked with a question mark and a Save jar with ${at(m, 1)}.`,
    Picture: ({ money }) => (
      <>
        <CoinStack x={500} y={96} />
        <Chip x={640} y={70} text={at(money, 0)} pop={1} gold size={30} />
        <Arrow d="M450 130 L360 170" />
        <Arrow d="M550 130 L640 170" />
        <JarArt cx={300} cy={JAR_Y + 20} scale={0.28} tone="spend" coins={0} />
        <Ask x={300} y={JAR_Y + 30} />
        <Label x={300} text="Spend" />
        <JarArt cx={700} cy={JAR_Y + 20} scale={0.28} tone="save" coins={4} />
        <Label x={700} text={`Save ${at(money, 1)}`} />
      </>
    ),
  },
  // "A goal costs 22. You start from zero and save 5 a week. How many weeks will it take?"
  "checkin-saving-goal": {
    label: (m) =>
      `A football goal costing ${at(m, 0)}, an empty Save jar getting ${at(m, 1)} a week, and a calendar with a question mark for the weeks.`,
    Picture: ({ money }) => (
      <>
        <Ball x={170} y={200} />
        <Chip x={170} y={62} text={at(money, 0)} pop={1} size={30} />
        <JarArt cx={480} cy={JAR_Y} scale={JAR_SCALE} tone="save" coins={0} />
        <Chip x={480} y={52} text={`+${at(money, 1)} a week`} pop={1} gold size={28} />
        <Label x={480} text="Save" />
        <Calendar x={800} y={200} />
        <Label x={800} text="weeks" />
      </>
    ),
  },
  // "You have 12 and choose a game for 8. What can you no longer get as well?"
  "checkin-tradeoffs": {
    label: (m) =>
      `A Spend jar with ${at(m, 0)}, a game for ${at(m, 1)} that has been chosen, and a book for ${at(m, 2)} and a snack for ${at(m, 3)}, each with a question mark.`,
    Picture: ({ money }) => (
      <>
        <JarArt cx={140} cy={JAR_Y} scale={0.28} tone="spend" coins={8} />
        <Chip x={140} y={62} text={at(money, 0)} pop={1} gold size={28} />
        <Label x={140} text="Spend" />
        <circle
          cx={400}
          cy={200}
          r={110}
          strokeWidth={6}
          className="fill-none stroke-teal-600 dark:stroke-teal-300"
        />
        <Gamepad x={400} y={200} />
        <Chip x={400} y={62} text={at(money, 1)} pop={1} size={28} />
        <Book x={650} y={210} />
        <Chip x={650} y={62} text={at(money, 2)} pop={1} size={28} />
        <Ask x={700} y={130} />
        <Snack x={860} y={210} />
        <Chip x={860} y={62} text={at(money, 3)} pop={1} size={28} />
        <Ask x={905} y={140} />
      </>
    ),
  },
  // "You save 3 a week for a goal. Your weekly saving drops to 2. What happens to your plan?"
  "checkin-changing-plans": {
    label: (m) =>
      `A football goal, a Save jar, the weekly saving going from ${at(m, 0)} down to ${at(m, 1)}, and a calendar with a question mark.`,
    Picture: ({ money }) => (
      <>
        <Ball x={150} y={200} />
        <JarArt cx={400} cy={JAR_Y} scale={0.28} tone="save" coins={3} />
        <Label x={400} text="Save" />
        <g>
          <Chip x={660} y={110} text={`${at(money, 0)} a week`} pop={1} size={28} />
          <path d="M560 110 H760" strokeWidth={6} strokeLinecap="round" className="stroke-ink-2" />
        </g>
        <Arrow d="M660 150 V170" />
        <Chip x={660} y={210} text={`${at(money, 1)} a week`} pop={1} gold size={28} />
        <Calendar x={880} y={200} />
      </>
    ),
  },
};

/** The picture above a question, or nothing when the question has none. */
export function StepPictureView({
  stepKey,
  prompt,
  currency,
}: {
  stepKey: string;
  /** The question's words with their money tokens, for the amounts. */
  prompt: string;
  currency: string;
}) {
  const picture = stepPictures[stepKey];
  if (!picture) return null;
  const money = moneyAmounts(prompt).map((minor) =>
    formatMoney(minor, currency, { showMinor: "nonzero" }),
  );
  return (
    <div className="overflow-hidden rounded-xl bg-tint-teal">
      <svg viewBox={VIEWBOX} role="img" aria-label={picture.label(money)} className="block w-full">
        <picture.Picture money={money} />
      </svg>
    </div>
  );
}
