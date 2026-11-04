import { cn } from "cn";

// A kid drawn like the hero's kid on the landing page (design.md §7): thick round-ended strokes,
// flat fills, a hoodie like the lid, trousers like the jar, gold only for coins. The geometry is
// the hero kid's standing pose (`features/landing/components/kid-art.tsx`), kid-local units with
// the origin between the feet and y growing downward. Server-safe: no hooks.

/** "talk" is a small open mouth, flapped with "smile" while a lesson film's narrator speaks. */
export type KidMood = "unsure" | "smile" | "cheer" | "talk";

export type KidHair = "crop" | "curls" | "bunches" | "bob";

/** What makes one kid look like themselves. Every colour is a brand token class. */
export type KidLook = {
  hair: KidHair;
  /** Fill class for the hair, e.g. "fill-hair-1". */
  hairClass: string;
  /** Fill class for skin, e.g. "fill-skin-1". */
  skinClass: string;
  /** Stroke class for the hoodie, e.g. "stroke-cyan-300". */
  topClass: string;
  /** Stroke class for the trousers, light and dark. */
  trousersClass: string;
  /** Stroke class for the shoes, light and dark. */
  shoesClass: string;
  accessory: "glasses" | "hairband" | "sticker" | null;
  /** Arm angles in degrees from straight down (positive swings to screen right) and reach 0 to 1. */
  arms: { right: number; left: number; reach: number };
  /** Where the coins are: cupped between both hands, held up in the right hand, or none. */
  coins: { where: "cupped"; count: 1 | 2 | 3 } | { where: "right-hand"; count: 1 } | null;
};

/** The box the figure is drawn in: from above the hair to just under the shadow. */
export const KID_VIEWBOX = "-84 -272 168 292";
/** Width to height of the drawing box, for a sized rendering. */
export const KID_ASPECT = 168 / 292;

const ARM = 74;
const SHOULDER_Y = -158;
const HEAD_Y = -212;
const INK = "fill-kid-ink";
const INK_STROKE = "stroke-kid-ink";

function hand(side: 1 | -1, arms: KidLook["arms"]) {
  const angle = ((side === 1 ? arms.right : arms.left) * Math.PI) / 180;
  const shoulder = { x: side * 18, y: SHOULDER_Y };
  return {
    shoulder,
    x: shoulder.x + Math.sin(angle) * ARM * arms.reach,
    y: shoulder.y + Math.cos(angle) * ARM * arms.reach,
  };
}

function Arm({ side, look }: { side: 1 | -1; look: KidLook }) {
  const { shoulder, x, y } = hand(side, look.arms);
  // The elbow bends away from the body, more when the arm is drawn in.
  const midX = (shoulder.x + x) / 2 + side * (8 + (1 - look.arms.reach) * 40);
  const midY = (shoulder.y + y) / 2 + 4;
  return (
    <g>
      <path
        d={`M${shoulder.x} ${shoulder.y}Q${midX} ${midY} ${x} ${y}`}
        fill="none"
        strokeWidth={18}
        strokeLinecap="round"
        className={look.topClass}
      />
      <circle cx={x} cy={y} r={11} className={look.skinClass} />
    </g>
  );
}

function Leg({ side, look }: { side: 1 | -1; look: KidLook }) {
  const hip = { x: side * 13, y: -94 };
  const foot = { x: side * 17, y: -10 };
  return (
    <g>
      <path
        d={`M${hip.x} ${hip.y}Q${(hip.x + foot.x) / 2} ${(hip.y + foot.y) / 2} ${foot.x} ${foot.y}`}
        fill="none"
        strokeWidth={26}
        strokeLinecap="round"
        className={look.trousersClass}
      />
      <path
        d={`M${foot.x - 4} ${foot.y + 4}L${foot.x + 14} ${foot.y + 4}`}
        strokeWidth={18}
        strokeLinecap="round"
        className={look.shoesClass}
      />
    </g>
  );
}

/** The mark's coin, at the kid's scale: gold on a teal rim. */
function Coin({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(0.32)`}>
      <ellipse cy={7} rx={50} ry={18} className="fill-teal-800" />
      <ellipse rx={50} ry={18} className="fill-gold" />
    </g>
  );
}

function Hair({ look }: { look: KidLook }) {
  const y = HEAD_Y;
  switch (look.hair) {
    case "crop":
      // The hero's cut: a swept fringe.
      return (
        <path
          d={`M-39 ${y + 4}C-45 ${y - 45} 40 ${y - 51} 40 ${y}C30 ${y - 18} 10 ${y - 22} -4 ${y - 14}C-16 ${y - 24} -31 ${y - 18} -39 ${y + 4}Z`}
          className={look.hairClass}
        />
      );
    case "curls":
      // Tight curls: a cap of circles round the crown.
      return (
        <g className={look.hairClass}>
          <path
            d={`M-40 ${y}C-40 ${y - 44} 40 ${y - 44} 40 ${y}L30 ${y - 4}C30 ${y - 24} -30 ${y - 24} -30 ${y - 4}Z`}
          />
          {[-34, -20, -6, 8, 22, 36].map((x, i) => (
            <circle key={x} cx={x} cy={y - 30 - (i % 2) * 6} r={11} />
          ))}
          <circle cx={-42} cy={y - 10} r={9} />
          <circle cx={42} cy={y - 10} r={9} />
        </g>
      );
    case "bunches":
      // A fringe and two bunches, one each side.
      return (
        <g className={look.hairClass}>
          <path
            d={`M-39 ${y + 2}C-42 ${y - 46} 42 ${y - 46} 39 ${y + 2}C28 ${y - 14} 8 ${y - 18} -6 ${y - 10}C-18 ${y - 20} -30 ${y - 16} -39 ${y + 2}Z`}
          />
          <ellipse cx={-48} cy={y + 6} rx={12} ry={18} transform={`rotate(14 -48 ${y + 6})`} />
          <ellipse cx={48} cy={y + 6} rx={12} ry={18} transform={`rotate(-14 48 ${y + 6})`} />
        </g>
      );
    case "bob":
      // A bob that curves in at the jaw, and a hairband.
      return (
        <g>
          <path
            d={`M-44 ${y + 30}C-48 ${y - 10} -44 ${y - 48} 0 ${y - 48}C44 ${y - 48} 48 ${y - 10} 44 ${y + 30}C40 ${y + 36} 34 ${y + 34} 32 ${y + 28}L32 ${y - 6}C20 ${y - 22} -20 ${y - 22} -32 ${y - 6}L-32 ${y + 28}C-34 ${y + 34} -40 ${y + 36} -44 ${y + 30}Z`}
            className={look.hairClass}
          />
          {look.accessory === "hairband" ? (
            <path
              d={`M-38 ${y - 22}C-20 ${y - 40} 20 ${y - 40} 38 ${y - 22}`}
              fill="none"
              strokeWidth={8}
              strokeLinecap="round"
              className="stroke-cyan-300"
            />
          ) : null}
        </g>
      );
  }
}

function Face({ look, mood }: { look: KidLook; mood: KidMood }) {
  const y = HEAD_Y;
  const mouthY = y + 18;
  return (
    <g>
      <ellipse cx={-22} cy={y + 15} rx={6.5} ry={4} className="fill-blush" opacity={0.45} />
      <ellipse cx={22} cy={y + 15} rx={6.5} ry={4} className="fill-blush" opacity={0.45} />
      <circle cx={-12} cy={y + 3} r={4.6} className={INK} />
      <circle cx={12} cy={y + 3} r={4.6} className={INK} />
      {look.accessory === "glasses" ? (
        <g fill="none" strokeWidth={3} className={INK_STROKE}>
          <circle cx={-12} cy={y + 3} r={10} />
          <circle cx={12} cy={y + 3} r={10} />
          <path d={`M-2 ${y + 3}h4`} strokeLinecap="round" />
        </g>
      ) : null}
      {mood === "cheer" ? (
        <path d={`M-10 ${mouthY - 2}Q0 ${mouthY + 15} 10 ${mouthY - 2}Z`} className={INK} />
      ) : mood === "talk" ? (
        <ellipse cx={0} cy={mouthY + 2} rx={6} ry={5} className={INK} />
      ) : (
        <path
          d={
            mood === "unsure"
              ? `M-8 ${mouthY}Q-4 ${mouthY - 4} 0 ${mouthY}Q4 ${mouthY + 4} 8 ${mouthY}`
              : `M-9 ${mouthY - 1}Q0 ${mouthY + 7} 9 ${mouthY - 1}`
          }
          fill="none"
          strokeWidth={3.5}
          strokeLinecap="round"
          className={INK_STROKE}
        />
      )}
    </g>
  );
}

function Coins({ look }: { look: KidLook }) {
  if (!look.coins) return null;
  if (look.coins.where === "right-hand") {
    const right = hand(1, look.arms);
    return <Coin x={right.x} y={right.y - 14} />;
  }
  const right = hand(1, look.arms);
  const left = hand(-1, look.arms);
  const x = (right.x + left.x) / 2;
  const y = (right.y + left.y) / 2;
  const levels = Array.from({ length: look.coins.count }, (_, level) => level);
  return (
    <>
      {levels.map((level) => (
        <Coin key={level} x={x} y={y - 12 - level * 7} />
      ))}
    </>
  );
}

/**
 * One kid, standing, as the hero's kid stands at the start of the landing page: shadow, legs,
 * hoodie, head with hair and a face, both arms, and their coins. `mood` sets the mouth: unsure
 * (wavy), a smile, or a cheer (open). Decorative inside its SVG; the caller labels the SVG.
 */
export function KidFigure({ look, mood = "smile" }: { look: KidLook; mood?: KidMood }) {
  const rightUp = look.arms.right > 90;
  return (
    <g data-hair={look.hair} data-top={look.topClass} data-mood={mood}>
      <ellipse cx={0} cy={4} rx={58} ry={9} className="fill-foreground" opacity={0.07} />
      <Leg side={-1} look={look} />
      <Leg side={1} look={look} />
      <path
        d="M0 -160L0 -118"
        strokeWidth={70}
        strokeLinecap="round"
        className={cn(look.topClass)}
      />
      {look.accessory === "sticker" ? (
        <circle
          cx={-16}
          cy={-150}
          r={9}
          strokeWidth={3}
          className="fill-cyan-300 stroke-teal-800"
        />
      ) : null}
      {/* A raised arm goes behind the head; the rest sit in front of the hoodie. */}
      {rightUp ? <Arm side={1} look={look} /> : null}
      <circle cx={0} cy={HEAD_Y} r={38} className={look.skinClass} />
      <Hair look={look} />
      <Face look={look} mood={mood} />
      <Arm side={-1} look={look} />
      {rightUp ? null : <Arm side={1} look={look} />}
      <Coins look={look} />
    </g>
  );
}
