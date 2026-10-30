import { cn } from "@/lib";

// The jar from the mark, redrawn as SVG so its parts can move (design.md §1, §7: tints of the jar
// are new drawings, never filters on the PNG). Artwork units are 512 × 512 with the jar centred
// on (256, 256); `jarPoint` maps an artwork point into the scene.

/** Where coins rest inside a jar, filled in this order from the bottom. */
export const PILE: readonly (readonly [number, number])[] = [
  [200, 368],
  [306, 372],
  [200, 346],
  [300, 344],
  [178, 320],
  [262, 316],
  [338, 312],
  [220, 290],
  [304, 286],
  [186, 262],
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
}: JarArtProps) {
  return (
    <g
      transform={`translate(${cx - 256 * scale} ${cy - 256 * scale}) scale(${scale})`}
      opacity={opacity}
    >
      <ellipse cx={256} cy={472} rx={176} ry={16} className="fill-foreground" opacity={0.07} />
      {PILE.slice(0, coins).map(([x, y], index) => (
        <g key={`${x}-${y}`} opacity={index >= fadeFrom ? fadeOpacity : 1}>
          <CoinArt x={x} y={y} />
        </g>
      ))}
      <path
        d="M150 128C172 152 160 176 128 198C98 220 88 246 88 290L88 352C88 395 112 418 155 418L352 418C395 418 418 395 418 352L418 170"
        fill="none"
        strokeWidth={64}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={
          tone === "spend"
            ? "stroke-teal-600 dark:stroke-teal-300"
            : "stroke-teal-800 dark:stroke-teal-500"
        }
      />
      <g transform={`translate(0 ${-14 * lidOpen}) rotate(${-28 * lidOpen} 100 89)`}>
        <rect x={96} y={58} width={262} height={62} rx={31} className="fill-cyan-300" />
      </g>
      {lidCoin ? (
        <g
          className={cn(bob && "motion-safe:animate-[coin-bob_2.4s_ease-in-out_infinite]")}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        >
          <ellipse cx={414} cy={88} rx={44} ry={32} className="fill-gold" />
        </g>
      ) : null}
    </g>
  );
}
