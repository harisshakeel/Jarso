import { palette, semantic } from "@jarso/brand/tokens";
import type { JarsoMood, LidColor, Wear } from "@jarso/core/mascot";
import { Circle, Ellipse, G, Path, Rect } from "react-native-svg";

const { teal, gold } = palette;
export const STROKE = teal["600"];
export const INK = teal["950"];
const WHITE = semantic.light.card;

const LID_HEX: Record<LidColor, string> = {
  cyan: palette.cyan["300"],
  grape: palette.grape["500"],
  blush: palette.blush,
  green: teal["600"],
  ink: palette["kid-ink"],
};

/** The lid colour as a palette value. */
export function lidHex(lid: LidColor): string {
  return LID_HEX[lid];
}

const arm = (d: string) => (
  <Path d={d} stroke={STROKE} strokeWidth={34} fill="none" strokeLinecap="round" />
);

export function Arms({ mood }: { mood: JarsoMood }) {
  switch (mood) {
    case "cheer":
      return (
        <>
          {arm("M84 290 Q30 240 36 170")}
          {arm("M422 290 Q476 240 470 170")}
        </>
      );
    case "wave":
      return (
        <>
          {arm("M84 300 Q40 330 52 380")}
          {arm("M422 290 Q480 250 486 180")}
        </>
      );
    case "wow":
      return (
        <>
          {arm("M84 300 Q30 300 40 250")}
          {arm("M422 300 Q476 300 466 250")}
        </>
      );
    case "think":
      return (
        <>
          {arm("M84 300 Q40 330 52 380")}
          {arm("M422 310 Q380 380 300 372")}
        </>
      );
    case "sleepy":
      return (
        <>
          {arm("M84 310 Q50 350 70 390")}
          {arm("M422 310 Q456 350 436 390")}
        </>
      );
    default:
      return (
        <>
          {arm("M84 300 Q40 330 52 380")}
          {arm("M422 300 Q466 330 454 380")}
        </>
      );
  }
}

export function Feet() {
  return (
    <>
      <Ellipse cx={190} cy={446} rx={46} ry={22} fill={teal["800"]} />
      <Ellipse cx={320} cy={446} rx={46} ry={22} fill={teal["800"]} />
    </>
  );
}

export function Lid({ lid }: { lid: LidColor }) {
  return (
    <>
      <Rect x={96} y={58} width={262} height={62} rx={31} fill={lidHex(lid)} />
      <Ellipse cx={414} cy={95} rx={44} ry={18} fill={teal["800"]} />
      <Ellipse cx={414} cy={88} rx={44} ry={18} fill={gold["200"]} />
    </>
  );
}

/** Wear that sits on the face (shades) is drawn over the eyes; the rest goes on the head, under them. */
export function wornOnFace(wear: Wear): boolean {
  return wear === "shades";
}

export function WearArt({ wear }: { wear: Wear }) {
  switch (wear) {
    case "cap":
      return (
        <G testID="jarso-wear-cap">
          <Path d="M110 70 Q227 -40 344 70 Z" fill={palette["kid-ink"]} />
          <Rect x={300} y={56} width={140} height={22} rx={11} fill={palette["kid-ink"]} />
          <Circle cx={227} cy={12} r={12} fill={gold["200"]} />
        </G>
      );
    case "crown":
      return (
        <G testID="jarso-wear-crown">
          <Path
            d="M120 62 L140 -10 L190 36 L227 -30 L264 36 L314 -10 L334 62 Z"
            fill={gold["200"]}
            stroke={gold["500"]}
            strokeWidth={10}
            strokeLinejoin="round"
          />
          <Circle cx={227} cy={-30} r={14} fill={palette.blush} />
        </G>
      );
    case "shades":
      return (
        <G testID="jarso-wear-shades">
          <Rect x={170} y={226} width={84} height={64} rx={26} fill={palette["kid-ink"]} />
          <Rect x={260} y={226} width={84} height={64} rx={26} fill={palette["kid-ink"]} />
          <Rect x={248} y={246} width={18} height={10} rx={5} fill={palette["kid-ink"]} />
        </G>
      );
    case "headphones":
      return (
        <G testID="jarso-wear-headphones">
          <Path
            d="M96 120 Q227 -20 358 120"
            stroke={palette["kid-ink"]}
            strokeWidth={20}
            fill="none"
            strokeLinecap="round"
          />
          <Rect x={70} y={96} width={48} height={84} rx={22} fill={palette.grape["500"]} />
          <Rect x={336} y={96} width={48} height={84} rx={22} fill={palette.grape["500"]} />
        </G>
      );
    default:
      return null;
  }
}

function Eye({
  cx,
  mood,
  gaze,
  blink,
}: {
  cx: number;
  mood: JarsoMood;
  gaze: "ahead" | "up";
  blink: boolean;
}) {
  const stroke = { stroke: INK, fill: "none", strokeLinecap: "round" } as const;
  if (mood === "sleepy")
    return <Path d={`M${cx - 30} 262 Q${cx} 284 ${cx + 30} 262`} strokeWidth={12} {...stroke} />;
  if (mood === "cheer")
    return <Path d={`M${cx - 30} 268 Q${cx} 222 ${cx + 30} 268`} strokeWidth={14} {...stroke} />;
  if (blink)
    return (
      <Path
        testID="jarso-blink"
        d={`M${cx - 30} 262 Q${cx} 284 ${cx + 30} 262`}
        strokeWidth={12}
        {...stroke}
      />
    );
  const wow = mood === "wow";
  const [dx, dy] = gaze === "up" ? [2, -14] : [4, 6];
  return (
    <>
      <Ellipse
        cx={cx}
        cy={258}
        rx={wow ? 40 : 36}
        ry={wow ? 50 : 46}
        fill={WHITE}
        stroke={STROKE}
        strokeWidth={8}
      />
      <Circle cx={cx + dx} cy={264 + dy} r={wow ? 15 : 19} fill={INK} />
      <Circle cx={cx + dx + 7} cy={256 + dy} r={6} fill={WHITE} />
    </>
  );
}

export function Face({
  mood,
  gaze,
  blink,
}: {
  mood: JarsoMood;
  gaze: "ahead" | "up";
  blink: boolean;
}) {
  const line = { stroke: INK, fill: "none", strokeLinecap: "round" } as const;
  return (
    <>
      <Circle cx={160} cy={322} r={20} fill={palette.blush} opacity={0.55} />
      <Circle cx={356} cy={322} r={20} fill={palette.blush} opacity={0.55} />
      <G testID="jarso-eyes">
        <Eye cx={212} mood={mood} gaze={gaze} blink={blink} />
        <Eye cx={302} mood={mood} gaze={gaze} blink={blink} />
      </G>
      <G testID={`jarso-mouth-${mood}`}>
        {mood === "cheer" ? (
          <>
            <Path d="M218 318 Q257 392 296 318 Z" fill={INK} />
            <Path d="M236 352 Q257 372 278 352 Q257 344 236 352Z" fill={palette.blush} />
          </>
        ) : mood === "wow" ? (
          <Ellipse cx={257} cy={344} rx={20} ry={24} fill={INK} />
        ) : mood === "think" ? (
          <Path d="M232 340 L282 332" strokeWidth={12} {...line} />
        ) : mood === "sleepy" ? (
          <>
            <Path d="M240 336 Q257 346 274 336" strokeWidth={10} {...line} />
            <Path
              d="M420 60 H462 L420 110 H462"
              strokeWidth={14}
              stroke={teal["300"]}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Path
              d="M470 10 H500 L470 46 H500"
              strokeWidth={11}
              stroke={teal["300"]}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        ) : (
          <Path d="M226 330 Q257 362 288 330" strokeWidth={12} {...line} />
        )}
      </G>
    </>
  );
}
