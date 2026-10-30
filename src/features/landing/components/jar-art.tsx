import { cn } from "@/lib";
import { JAR_OUTLINE_D } from "../jar-outline";

// The jar from the mark, redrawn as SVG so its parts can move (design.md §1, §7: tints of the jar
// are new drawings, never filters on the PNG). Artwork units are 512 × 512 with the jar centred
// on (256, 256); `jarPoint` maps an artwork point into the scene.

/**
 * Where coins rest inside a jar, filled in this order from the bottom. The upper rows keep to the
 * right of the neck's curl; eighteen coins fill the jar to about four fifths.
 */
export const PILE: readonly (readonly [number, number])[] = [
  [200, 368],
  [306, 372],
  [200, 346],
  [300, 344],
  [178, 320],
  [262, 316],
  [334, 312],
  [220, 290],
  [304, 286],
  [186, 262],
  [282, 262],
  [232, 240],
  [330, 238],
  [282, 216],
  [220, 214],
  [334, 212],
  [256, 192],
  [316, 190],
];

export function jarPoint(
  [lx, ly]: readonly [number, number],
  cx: number,
  cy: number,
  scale: number,
) {
  return { x: cx + (lx - 256) * scale, y: cy + (ly - 256) * scale };
}

/** A gold coin with a teal-800 rim, as in the mark. Drawn at artwork size; scale the parent. */
export function CoinArt({ x, y, scaleX = 1 }: { x: number; y: number; scaleX?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scaleX} 1)`}>
      <ellipse cy={7} rx={50} ry={18} className="fill-teal-800" />
      <ellipse rx={50} ry={18} className="fill-gold" />
    </g>
  );
}

type JarArtProps = {
  cx: number;
  cy: number;
  scale: number;
  /**
   * Spend is the teal jar of the mark; Save is the same jar in a deeper teal. Gold stays for money
   * only (the coins and the Save ring), so a gold jar inside a gold ring never blurs into one shape.
   */
  tone: "spend" | "save";
  /** Coins resting inside. */
  coins: number;
  /** Opacity for coins from this index up, to fade extra coins away. */
  fadeFrom?: number;
  fadeOpacity?: number;
  /** 0 closed, 1 open. */
  lidOpen?: number;
  /** The coin beside the lid, as in the mark. */
  lidCoin?: boolean;
  /** Gentle idle bob of the lid coin (reduced motion stops it). */
  bob?: boolean;
  opacity?: number;
  /** How much of the outline is drawn, 0 to 1, along the stroke from the top-left curl. */
  draw?: number;
  /** The lid dropping into place, 0 (above, invisible) to 1 (on). */
  lidIn?: number;
  /** The lid coin popping in, 0 to 1 (may overshoot). */
  lidCoinIn?: number;
};

export function JarArt({
  cx,
  cy,
  scale,
  tone,
  coins,
  fadeFrom = PILE.length,
  fadeOpacity = 1,
  lidOpen = 0,
  lidCoin = false,
  bob = false,
  opacity = 1,
  draw = 1,
  lidIn = 1,
  lidCoinIn = 1,
}: JarArtProps) {
  return (
    <g
      transform={`translate(${cx - 256 * scale} ${cy - 256 * scale}) scale(${scale})`}
      opacity={opacity}
    >
      <ellipse
        cx={256}
        cy={472}
        rx={176 * draw}
        ry={16}
        className="fill-foreground"
        opacity={0.07 * draw}
      />
      {PILE.slice(0, coins).map(([x, y], index) => (
        <g key={`${x}-${y}`} opacity={index >= fadeFrom ? fadeOpacity : 1}>
          <CoinArt x={x} y={y} />
        </g>
      ))}
      <path
        d={JAR_OUTLINE_D}
        fill="none"
        strokeWidth={64}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={draw < 1 ? "1 1" : undefined}
        strokeDashoffset={draw < 1 ? 1 - draw : undefined}
        opacity={draw > 0 ? 1 : 0}
        className={
          tone === "spend"
            ? "stroke-teal-600 dark:stroke-teal-300"
            : "stroke-teal-800 dark:stroke-teal-500"
        }
      />
      {lidIn > 0 ? (
        <g
          transform={`translate(0 ${-14 * lidOpen - 120 * (1 - lidIn)}) rotate(${-28 * lidOpen} 100 89)`}
          opacity={lidIn}
        >
          <rect x={96} y={58} width={262} height={62} rx={31} className="fill-cyan-300" />
        </g>
      ) : null}
      {lidCoin && lidCoinIn > 0 ? (
        <g transform={`translate(414 88) scale(${lidCoinIn}) translate(-414 -88)`}>
          <g
            className={cn(bob && "motion-safe:animate-[coin-bob_2.4s_ease-in-out_infinite]")}
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
          >
            <ellipse cx={414} cy={88} rx={44} ry={32} className="fill-gold" />
          </g>
        </g>
      ) : null}
    </g>
  );
}
