import type { ReactNode } from "react";
import {
  CoinArt,
  coachLooks,
  JarArt,
  jarPoint,
  KidFigure,
  type KidMood,
  PILE,
} from "@/components/brand";
import { drop, easeInOut, easeOut, easeOutBack, lerp, segment } from "@/lib";

// The lesson films' pictures (design.md §6, "Lesson film"): the hero's jar and coins, with Nell
// telling the story. Every frame is a pure function of `p` (0 to 1), as on the landing page; the
// player moves `p` through one beat per spoken line, in step with the voice. Scene units are a
// 1000 × 560 box; the jar artwork is 512 units, drawn at half size.

export type FilmScene = {
  /** One [from, to] range of `p` per spoken line, in order, covering 0 to 1. */
  beats: readonly (readonly [number, number])[];
  /** What the picture shows, for screen readers (the captions carry the words). */
  label: string;
  Scene: (props: { p: number; mood: KidMood }) => ReactNode;
};

export const FILM_VIEWBOX = "0 0 1000 560";
const JAR_SCALE = 0.5;
const COIN_SCALE = 0.42;

/** Nell, the films' narrator: standing on the left, swaying a little while she talks. */
function Nell({ mood, x = 150 }: { mood: KidMood; x?: number }) {
  return (
    <g transform={`translate(${x} 528) scale(1.15)`}>
      <KidFigure look={coachLooks.nell} mood={mood} />
    </g>
  );
}

/** A coin in scene units, popping in with `pop` (0 to 1, may overshoot). */
function Coin({ x, y, pop = 1 }: { x: number; y: number; pop?: number }) {
  if (pop <= 0) return null;
  return (
    <g transform={`translate(${x} ${y}) scale(${COIN_SCALE * pop})`}>
      <CoinArt x={0} y={0} />
    </g>
  );
}

/** A rounded label with bold text, popping in with `pop`. Gold for money, plain otherwise. */
function Chip({
  x,
  y,
  text,
  pop,
  gold = false,
  size = 34,
}: {
  x: number;
  y: number;
  text: string;
  pop: number;
  gold?: boolean;
  size?: number;
}) {
  if (pop <= 0) return null;
  const width = text.length * size * 0.62 + size * 1.2;
  const height = size * 1.7;
  return (
    <g transform={`translate(${x} ${y}) scale(${pop})`}>
      <rect
        x={-width / 2}
        y={-height / 2}
        width={width}
        height={height}
        rx={height / 2}
        strokeWidth={4}
        className={
          gold ? "fill-gold stroke-gold-700" : "fill-card stroke-teal-800 dark:stroke-teal-300"
        }
      />
      <text
        y={size * 0.36}
        textAnchor="middle"
        fontSize={size}
        className={gold ? "fill-gold-foreground font-extrabold" : "fill-foreground font-extrabold"}
      >
        {text}
      </text>
    </g>
  );
}

/** A jar's name under it, fading in. */
function JarLabel({ x, text, shown }: { x: number; text: string; shown: number }) {
  return (
    <text
      x={x}
      y={470}
      textAnchor="middle"
      fontSize={30}
      opacity={shown}
      className="fill-foreground font-bold"
    >
      {text}
    </text>
  );
}

/** A point on a hop from `a` to `b`, `t` 0 to 1, arcing `height` units up. */
function hop(a: { x: number; y: number }, b: { x: number; y: number }, t: number, height = 130) {
  const e = easeInOut(t);
  return { x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e) - Math.sin(Math.PI * t) * height };
}

// ---------------------------------------------------------------------------------------------
// Day 1, "What's in Spend?": peek in Spend (8 coins), a toy for 5, pay, 3 left.

const SPEND1 = { x: 470, y: 300 };
const TOY = { x: 820, y: 400 };
const TAG = { x: 820, y: 236 };
const PAY = 5;

/** A toy car: cyan body, a window, two wheels. Drawn around its centre. */
function ToyCar({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect
        x={-90}
        y={-40}
        width={180}
        height={58}
        rx={22}
        strokeWidth={6}
        className="fill-cyan-300 stroke-teal-800"
      />
      <path
        d="M-48 -40 L-30 -82 H34 L54 -40 Z"
        strokeWidth={6}
        strokeLinejoin="round"
        className="fill-teal-100 stroke-teal-800"
      />
      <circle cx={-50} cy={22} r={22} className="fill-teal-900" />
      <circle cx={52} cy={22} r={22} className="fill-teal-900" />
      <circle cx={-50} cy={22} r={8} className="fill-card" />
      <circle cx={52} cy={22} r={8} className="fill-card" />
    </g>
  );
}

const whatsInSpend: FilmScene = {
  beats: [
    [0, 0.33],
    [0.33, 0.72],
    [0.72, 1],
  ],
  label:
    "Nell beside a Spend jar holding eight coins. A toy car with a price tag of five coins rolls in, five coins hop from the jar to the tag, and three coins stay in the jar.",
  Scene: ({ p, mood }) => {
    const coinsIn = Math.round(8 * segment(p, 0.06, 0.24));
    const hops = Array.from({ length: PAY }, (_, k) => {
      const start = 0.48 + k * 0.045;
      return { k, t: segment(p, start, start + 0.08) };
    });
    const left = coinsIn - hops.filter(({ t }) => t > 0).length;
    const toyIn = easeOut(segment(p, 0.34, 0.44));
    const tagPop = easeOutBack(segment(p, 0.42, 0.48));
    const paid = hops.filter(({ t }) => t >= 1).length;
    const glow = segment(p, 0.74, 0.8) * (1 - 0.35 * Math.sin(Math.PI * 4 * segment(p, 0.8, 1)));
    return (
      <>
        <Nell mood={mood} />
        <JarArt
          cx={SPEND1.x}
          cy={SPEND1.y}
          scale={JAR_SCALE}
          tone="spend"
          coins={Math.max(0, left)}
          draw={easeInOut(segment(p, 0, 0.1))}
          lidOpen={easeOut(segment(p, 0.24, 0.3)) * (1 - easeOut(segment(p, 0.93, 0.99)))}
        />
        <JarLabel x={SPEND1.x} text="Spend" shown={segment(p, 0.05, 0.12)} />
        <Chip
          x={SPEND1.x}
          y={118}
          text={`${left} coins`}
          gold
          pop={easeOutBack(segment(p, 0.26, 0.31)) * (1 - segment(p, 0.74, 0.76))}
        />

        {/* The toy and its price, then the coins paying for it. */}
        {toyIn > 0 ? (
          <g opacity={1 - segment(p, 0.9, 0.97)}>
            <ToyCar x={lerp(1140, TOY.x, toyIn)} y={TOY.y} />
            <path
              d={`M${TAG.x} ${TAG.y + 34} L${lerp(1140, TOY.x, toyIn)} ${TOY.y - 82}`}
              strokeWidth={3}
              className="stroke-ink-2"
              opacity={tagPop > 0 ? 1 : 0}
            />
            <Chip x={TAG.x} y={TAG.y} text={paid >= PAY ? "Paid!" : "5 coins"} pop={tagPop} />
            <Coin x={TAG.x} y={TAG.y + 66} pop={paid > 0 ? 1 : 0} />
          </g>
        ) : null}
        {hops.map(({ k, t }) => {
          if (t <= 0 || t >= 1) return null;
          const from = jarPoint(PILE[7 - k] ?? [256, 256], SPEND1.x, SPEND1.y, JAR_SCALE);
          const at = hop(from, { x: TAG.x, y: TAG.y + 66 }, t);
          return <Coin key={k} x={at.x} y={at.y} />;
        })}

        {/* What's left: the three coins glow, and the sum says why. */}
        {glow > 0
          ? PILE.slice(0, 3).map(([px, py]) => {
              const at = jarPoint([px, py], SPEND1.x, SPEND1.y, JAR_SCALE);
              return (
                <ellipse
                  key={`${px}-${py}`}
                  cx={at.x}
                  cy={at.y}
                  rx={34}
                  ry={18}
                  fill="none"
                  strokeWidth={5}
                  className="stroke-gold"
                  opacity={glow}
                />
              );
            })
          : null}
        <Chip x={SPEND1.x} y={118} text="8 − 5 = 3" pop={easeOutBack(segment(p, 0.76, 0.82))} />
        <Chip
          x={SPEND1.x}
          y={518}
          text="3 left"
          gold
          size={28}
          pop={easeOutBack(segment(p, 0.84, 0.9))}
        />
      </>
    );
  },
};

// ---------------------------------------------------------------------------------------------
// Day 3, "Spend and Save": ten coins arrive, the jar becomes two, four hop to Save, 6 + 4 = 10.

const ONE = { x: 560, y: 300 };
const SPEND3 = { x: 420, y: 300 };
const SAVE3 = { x: 760, y: 300 };
const TOTAL = 10;
const TO_SAVE = 4;

const spendAndSave: FilmScene = {
  beats: [
    [0, 0.3],
    [0.3, 0.72],
    [0.72, 1],
  ],
  label:
    "Nell beside a jar. Ten coins fall into it, the jar splits into Spend and Save, four coins hop across to Save, and six plus four equals ten.",
  Scene: ({ p, mood }) => {
    const falls = Array.from({ length: TOTAL }, (_, k) => {
      const start = 0.05 + k * 0.018;
      return { k, t: segment(p, start, start + 0.07) };
    });
    const landed = falls.filter(({ t }) => t >= 1).length;
    const split = easeInOut(segment(p, 0.32, 0.42));
    const spendX = lerp(ONE.x, SPEND3.x, split);
    const saveX = lerp(ONE.x, SAVE3.x, split);
    const hops = Array.from({ length: TO_SAVE }, (_, k) => {
      const start = 0.46 + k * 0.055;
      return { k, t: segment(p, start, start + 0.09) };
    });
    const left = landed - hops.filter(({ t }) => t > 0).length;
    const saved = hops.filter(({ t }) => t >= 1).length;
    const labels = segment(p, 0.4, 0.46);
    const counted = segment(p, 0.74, 0.78);
    return (
      <>
        <Nell mood={mood} x={140} />
        {split > 0 ? (
          <JarArt
            cx={saveX}
            cy={SAVE3.y}
            scale={JAR_SCALE}
            tone="save"
            coins={saved}
            opacity={segment(p, 0.32, 0.37)}
          />
        ) : null}
        <JarArt
          cx={spendX}
          cy={ONE.y}
          scale={JAR_SCALE}
          tone="spend"
          coins={Math.max(0, left)}
          draw={easeInOut(segment(p, 0, 0.08))}
        />
        {falls.map(({ k, t }) => {
          if (t <= 0 || t >= 1) return null;
          const target = jarPoint(PILE[k] ?? [256, 256], ONE.x, ONE.y, JAR_SCALE);
          return <Coin key={k} x={target.x} y={lerp(-50, target.y, drop(t))} />;
        })}
        <Chip
          x={ONE.x}
          y={118}
          text="10 coins"
          gold
          pop={easeOutBack(segment(p, 0.25, 0.3)) * (1 - segment(p, 0.33, 0.36))}
        />

        <JarLabel x={spendX} text={counted > 0 ? `Spend · ${left}` : "Spend"} shown={labels} />
        <JarLabel x={saveX} text={counted > 0 ? `Save · ${saved}` : "Save"} shown={labels} />
        {hops.map(({ k, t }) => {
          if (t <= 0 || t >= 1) return null;
          const from = jarPoint(PILE[TOTAL - 1 - k] ?? [256, 256], SPEND3.x, SPEND3.y, JAR_SCALE);
          const to = jarPoint(PILE[k] ?? [256, 256], SAVE3.x, SAVE3.y, JAR_SCALE);
          return <Coin key={k} x={hop(from, to, t, 150).x} y={hop(from, to, t, 150).y} />;
        })}

        <Chip
          x={(SPEND3.x + SAVE3.x) / 2}
          y={110}
          text="6 + 4 = 10"
          pop={easeOutBack(segment(p, 0.76, 0.82))}
        />
      </>
    );
  },
};

/** The films so far, by mission key. A mission without one starts at its first step. */
export const filmScenes: Readonly<Partial<Record<string, FilmScene>>> = {
  "whats-in-spend": whatsInSpend,
  "spend-and-save": spendAndSave,
};
