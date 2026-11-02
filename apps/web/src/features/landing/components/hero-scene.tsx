import { drop, easeInOut, easeOut, easeOutBack, lerp, segment } from "../motion";
import { CoinArt, JarArt, jarPoint, PILE } from "./jar-art";
import { KidArt, kidHands, kidPose } from "./kid-art";

// The hero in two acts, drawn from scroll progress (0 to 1).
// Act 1, the toss (0 to 0.5): the kid stands alone with a handful of coins, unsure what to do with
// them, then throws them up. The view follows the coins, so the kid leaves the frame; the coins
// hang in the air while the jar draws itself below, then drop in, and the lid and its coin land.
// The checkpoint (0.5): one jar, eight coins, centred. Act 2, the savings loop (0.5 to 1): the jar
// splits into Spend and Save, a coin is spent, Save fills toward its goal, and it returns to one jar.

const SCALE = 0.5;
const Y = 310;
/** The kid stands low in the frame, so the question bubbles have room above the head. */
const KID_GROUND = 488;
const CENTRE = 500;
const LEFT = 330;
const RIGHT = 670;
/** The jar labels, under the jars. */
const LABEL_Y = 462;
/** Coins poured into Save in the saving beat: its pile rises to about three quarters. */
const POUR = 12;
/** How far the view travels up with the coins, in scene units. */
const PAN = 460;

/** Where act 1 hands over to act 2. */
export const CHECKPOINT = 0.5;
/** From here the thread (`jar-thread.tsx`) draws the jar's outline and unwinds it. */
export const UNWIND_START = 0.93;
/** Where the jar sits in the scene at the checkpoint and at the end, and its scale. */
export const JAR = { x: CENTRE, y: Y, scale: SCALE } as const;
/** Each tagline pops in at its start and stays until they all leave together. */
export const taglineStarts = [0.15, 0.27, 0.42] as const;
export const taglinesLeave: readonly [number, number] = [0.46, 0.49];
/** Act 2 caption windows, matching `landingCopy.hero.captions`. */
export const captionWindows: readonly (readonly [number, number])[] = [
  [0.52, 0.73],
  [0.745, 0.885],
  [0.895, 1.01],
];

// Eight coins: thrown together from both hands, spread out near the top of the view, then each
// falls into its place in the jar (PILE order), so the jar ends act 1 as act 2 begins.
const COINS = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => ({
  k,
  launch: 0.1 + k * 0.004,
  apex: { x: CENTRE + (k - 3.5) * 38 + ((k * 37) % 11) - 5, y: 126 + ((k * 53) % 4) * 15 },
  fall: 0.3 + k * 0.018,
}));

function Toss({ p }: { p: number }) {
  const pose = kidPose(p);
  const hands = kidHands(pose);
  const pan = PAN * easeInOut(segment(p, 0.11, 0.24));
  const kidShown = 1 - segment(p, 0.21, 0.25);
  const waiting = COINS.filter(({ launch }) => p < launch).length;
  const landed = COINS.filter(({ fall }) => p >= fall + 0.06).length;

  return (
    <>
      <JarArt
        cx={CENTRE}
        cy={Y}
        scale={SCALE}
        tone="spend"
        coins={landed}
        draw={easeInOut(segment(p, 0.2, 0.31))}
        lidIn={easeOut(segment(p, 0.445, 0.47))}
        lidCoin
        lidCoinIn={easeOutBack(segment(p, 0.465, 0.49))}
      />

      {kidShown > 0 ? (
        <g transform={`translate(0 ${pan})`} opacity={kidShown}>
          <KidArt x={CENTRE} y={KID_GROUND} pose={pose} wonder={1 - segment(p, 0.03, 0.07)} />
          {/* The handful, cupped in both hands until the throw. */}
          {[0, 1, 2].slice(0, Math.min(3, waiting)).map((level) => (
            <g
              key={level}
              transform={`translate(${CENTRE + hands.x} ${KID_GROUND + hands.y - 12 - level * 7}) scale(0.32)`}
            >
              <CoinArt x={0} y={0} />
            </g>
          ))}
        </g>
      ) : null}

      {COINS.map(({ k, launch, apex, fall }) => {
        if (p < launch || p >= fall + 0.06) return null;
        const thrown = kidHands(kidPose(launch));
        const from = k % 2 ? thrown.left : thrown.right;
        const start = { x: CENTRE + from.x, y: KID_GROUND + from.y - 8 };
        const rise = easeOut(segment(p, launch, launch + 0.09));
        const falling = segment(p, fall, fall + 0.06);
        // Hanging at the top: a slow drift and a spin, as if weightless for a moment.
        const drift = Math.sin(p * 90 + k * 1.7) * 5 * rise * (1 - falling);
        const hangX = lerp(start.x, apex.x, rise);
        const hangY = lerp(start.y, apex.y, rise) + drift;
        const target = jarPoint(PILE[k] ?? [0, 0], CENTRE, Y, SCALE);
        const x = lerp(hangX, target.x, easeOut(falling));
        const y = lerp(hangY, target.y, falling * falling);
        const spin = Math.max(0.2, Math.abs(Math.cos(p * 70 + k)));
        return (
          <g key={k} transform={`translate(${x} ${y}) scale(${SCALE * spin} ${SCALE})`}>
            <CoinArt x={0} y={0} />
          </g>
        );
      })}
    </>
  );
}

/** The unwind start in act 2's own progress. */
const UNWIND_S = (UNWIND_START - CHECKPOINT) / (1 - CHECKPOINT);

function Savings({ s }: { s: number }) {
  // Split, and the merge back at the end.
  const split = easeInOut(segment(s, 0.03, 0.17));
  const merge = easeInOut(segment(s, 0.8, 0.86));
  const spendX = lerp(lerp(CENTRE, LEFT, split), CENTRE, merge);
  const saveX = lerp(lerp(CENTRE, RIGHT, split), CENTRE, merge);
  const saveOpacity = segment(s, 0.03, 0.086) * (1 - segment(s, 0.83, 0.86));

  // Three coins hop from Spend to Save.
  const hops = [0, 1, 2].map((j) => ({ j, t: segment(s, 0.186 + j * 0.043, 0.257 + j * 0.043) }));
  const hopsStarted = hops.filter(({ t }) => t > 0).length;
  const hopsDone = hops.filter(({ t }) => t >= 1).length;

  // Spending: a coin rises, flips into a ticked card, and floats away.
  const rise = segment(s, 0.343, 0.4);
  const flip = segment(s, 0.393, 0.436);
  const away = segment(s, 0.436, 0.493);
  // On the merge Save's coins pour across, so the one jar ends full: every coin, kept together.
  const merged = Math.round((PILE.length - 4) * easeInOut(segment(s, 0.81, 0.86)));
  const spendCoins = 8 - hopsStarted - (rise > 0 ? 1 : 0) + merged;

  // Saving: a stream of coins pours into Save and its pile rises to about three quarters of the
  // jar. The height of the coins is the progress: no bar, no ring.
  const saveDrops = Array.from({ length: POUR }, (_, j) => ({
    j,
    t: segment(s, 0.52 + j * 0.018, 0.57 + j * 0.018),
  }));
  const saveLanded = saveDrops.filter(({ t }) => t >= 1).length;
  // The lid swings open for the pour and shuts after the last coin.
  const saveLid = easeOut(segment(s, 0.5, 0.53)) * (1 - easeInOut(segment(s, 0.77, 0.8)));
  const labels = segment(s, 0.143, 0.2) * (1 - segment(s, 0.79, 0.82));

  // The unwind: the thread takes over the outline; the coins and the lid fade away.
  const unwinding = s >= UNWIND_S;
  const dissolve = 1 - segment(s, UNWIND_S, UNWIND_S + 0.06);

  const risingFrom = jarPoint(PILE[4] ?? [0, 0], spendX, Y, SCALE);
  const rising = {
    x: risingFrom.x,
    y: lerp(risingFrom.y, 150, easeOut(rise)) - 60 * easeOut(away),
  };

  return (
    <>
      <JarArt
        cx={saveX}
        cy={Y}
        scale={SCALE}
        tone="save"
        coins={hopsDone + saveLanded}
        opacity={saveOpacity}
        lidOpen={saveLid}
      />
      <JarArt
        cx={spendX}
        cy={Y}
        scale={SCALE}
        tone="spend"
        coins={Math.max(0, spendCoins)}
        fadeFrom={unwinding ? 0 : PILE.length}
        fadeOpacity={unwinding ? dissolve : 1}
        lidCoin
        lidIn={dissolve}
        lidCoinIn={dissolve}
        draw={unwinding ? 0 : 1}
      />

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

      {saveDrops.map(({ j, t }) => {
        if (t <= 0 || t >= 1) return null;
        const to = jarPoint(PILE[3 + j] ?? [0, 0], saveX, Y, SCALE);
        return (
          <g
            key={j}
            transform={`translate(${to.x + (((j * 37) % 15) - 7) * (1 - t)} ${lerp(60, to.y, drop(t))}) scale(${SCALE})`}
          >
            <CoinArt x={0} y={0} />
          </g>
        );
      })}

      {labels > 0 ? (
        <g opacity={labels} className="fill-foreground font-bold" fontSize={28} textAnchor="middle">
          <text x={spendX} y={LABEL_Y}>
            Spend
          </text>
          <text x={saveX} y={LABEL_Y}>
            Save
          </text>
        </g>
      ) : null}
    </>
  );
}

export function HeroScene({ progress: p }: { progress: number }) {
  return (
    // Framed tight around what the scene uses; coins fly above the frame, the kid leaves below it.
    <svg
      data-jar-scene
      viewBox="180 110 640 390"
      className="size-full overflow-visible"
      aria-hidden
    >
      {p < CHECKPOINT ? <Toss p={p} /> : <Savings s={segment(p, CHECKPOINT, 1)} />}
    </svg>
  );
}
