import { drop, easeInOut, easeOut, easeOutBack, lerp, segment } from "../motion";
import { CoinArt, JarArt, jarPoint, PILE } from "./jar-art";

// The hero's money loop, drawn from scroll progress (0 to 1). It stands in for the generated
// video (spec §5) and follows the same beats, so the captions line up with either:
// allowance arrives, the jar splits into Spend and Save, a coin is spent, the Save ring fills,
// then everything returns to the opening frame.

const SCALE = 0.5;
const Y = 310;
const CENTRE = 500;
const LEFT = 330;
const RIGHT = 670;
const RING = 160;

/** Caption windows in scroll progress, matching `landingCopy.hero.captions`. */
export const captionWindows: readonly (readonly [number, number])[] = [
  [0.08, 0.3],
  [0.33, 0.62],
  [0.64, 0.86],
  [0.88, 1.01],
];

export function HeroScene({ progress: p }: { progress: number }) {
  // Split, and the merge back at the end.
  const split = easeInOut(segment(p, 0.32, 0.42));
  const merge = easeInOut(segment(p, 0.9, 0.98));
  const spendX = lerp(lerp(CENTRE, LEFT, split), CENTRE, merge);
  const saveX = lerp(lerp(CENTRE, RIGHT, split), CENTRE, merge);
  const saveOpacity = segment(p, 0.32, 0.36) * (1 - segment(p, 0.95, 0.99));

  // Allowance day: the lid opens, five coins drop in, the lid closes.
  const lidOpen = easeOut(segment(p, 0.08, 0.11)) * (1 - easeInOut(segment(p, 0.27, 0.3)));
  const drops = [0, 1, 2, 3, 4].map((k) => ({
    k,
    t: segment(p, 0.1 + k * 0.032, 0.17 + k * 0.032),
  }));
  const landed = drops.filter(({ t }) => t >= 1).length;

  // Three coins hop from Spend to Save.
  const hops = [0, 1, 2].map((j) => ({ j, t: segment(p, 0.43 + j * 0.03, 0.48 + j * 0.03) }));
  const hopsStarted = hops.filter(({ t }) => t > 0).length;
  const hopsDone = hops.filter(({ t }) => t >= 1).length;

  // Spending: a coin rises, flips into a ticked card, and floats away.
  const rise = segment(p, 0.54, 0.58);
  const flip = segment(p, 0.575, 0.605);
  const away = segment(p, 0.605, 0.645);
  const spendCoins = p >= 0.95 ? 3 : 3 + landed - hopsStarted - (rise > 0 ? 1 : 0);

  // Saving: the ring fills around the Save jar, a star pops at the top.
  const ringOpacity = segment(p, 0.66, 0.68) * (1 - segment(p, 0.88, 0.91));
  const ringFill = lerp(0.33, 0.75, easeInOut(segment(p, 0.68, 0.82)));
  const star = easeOutBack(segment(p, 0.82, 0.86));
  const labels = segment(p, 0.4, 0.44) * (1 - segment(p, 0.88, 0.91));

  const risingFrom = jarPoint(PILE[4] ?? [0, 0], spendX, Y, SCALE);
  const rising = {
    x: risingFrom.x,
    y: lerp(risingFrom.y, 150, easeOut(rise)) - 60 * easeOut(away),
  };

  return (
    // Framed tight around the jars and the ring; coins fall in from above the frame.
    <svg viewBox="180 100 640 450" className="size-full overflow-visible" aria-hidden>
      <JarArt cx={saveX} cy={Y} scale={SCALE} tone="save" coins={hopsDone} opacity={saveOpacity} />
      <JarArt
        cx={spendX}
        cy={Y}
        scale={SCALE}
        tone="spend"
        coins={Math.max(0, spendCoins)}
        fadeFrom={3}
        fadeOpacity={1 - segment(p, 0.9, 0.95)}
        lidOpen={lidOpen}
        lidCoin
        bob={p < 0.005}
      />

      {drops.map(({ k, t }) => {
        if (t <= 0 || t >= 1) return null;
        const target = jarPoint(PILE[3 + k] ?? [0, 0], CENTRE, Y, SCALE);
        const startX = target.x + (k % 2 ? 14 : -14);
        return (
          <g
            key={k}
            transform={`translate(${lerp(startX, target.x, t)} ${lerp(-40, target.y, drop(t))}) scale(${SCALE})`}
          >
            <CoinArt x={0} y={0} />
          </g>
        );
      })}

      {hops.map(({ j, t }) => {
        if (t <= 0 || t >= 1) return null;
        const from = jarPoint(PILE[7 - j] ?? [0, 0], spendX, Y, SCALE);
        const to = jarPoint(PILE[j] ?? [0, 0], saveX, Y, SCALE);
        const e = easeInOut(t);
        return (
          <g
            key={j}
            transform={`translate(${lerp(from.x, to.x, e)} ${lerp(from.y, to.y, e) - Math.sin(Math.PI * t) * 110}) scale(${SCALE})`}
          >
            <CoinArt x={0} y={0} />
          </g>
        );
      })}

      {rise > 0 && away < 1 ? (
        <g transform={`translate(${rising.x} ${rising.y})`} opacity={1 - away}>
          {flip < 0.5 ? (
            <g transform={`scale(${SCALE})`}>
              <CoinArt x={0} y={0} scaleX={Math.cos(flip * Math.PI)} />
            </g>
          ) : (
            <g transform={`scale(${-Math.cos(flip * Math.PI)} 1)`}>
              <rect
                x={-46}
                y={-32}
                width={92}
                height={64}
                rx={14}
                className="fill-card stroke-hairline-strong"
                strokeWidth={2}
              />
              <path
                d="M-18 0L-5 12L20 -13"
                fill="none"
                strokeWidth={8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="stroke-primary"
              />
            </g>
          )}
        </g>
      ) : null}

      {ringOpacity > 0 ? (
        <g opacity={ringOpacity}>
          <circle
            cx={saveX}
            cy={Y}
            r={RING}
            fill="none"
            strokeWidth={14}
            className="stroke-teal-100 dark:stroke-teal-900"
          />
          <circle
            cx={saveX}
            cy={Y}
            r={RING}
            fill="none"
            strokeWidth={14}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${ringFill * 100} 100`}
            transform={`rotate(-90 ${saveX} ${Y})`}
            className="stroke-gold"
          />
          <g transform={`translate(${saveX} ${Y - RING}) scale(${star})`}>
            <path
              d="M0 -22L6.5 -7L22 -6.5L10 4L14 20L0 11L-14 20L-10 4L-22 -6.5L-6.5 -7Z"
              className="fill-gold stroke-gold-700"
              strokeWidth={2}
              strokeLinejoin="round"
            />
          </g>
        </g>
      ) : null}

      {labels > 0 ? (
        <g opacity={labels} className="fill-foreground font-bold" fontSize={28} textAnchor="middle">
          <text x={spendX} y={Y + 200}>
            Spend
          </text>
          <text x={saveX} y={Y + 200}>
            Save
          </text>
        </g>
      ) : null}
    </svg>
  );
}
