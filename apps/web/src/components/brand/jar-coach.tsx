import type { CoachId } from "@jarso/core/learning";
import { cn } from "cn";
import { JAR_OUTLINE_D } from "./jar-outline";

// The lesson coaches (design.md §7): the mark's jar, redrawn as SVG with a face, four ways.
// Server-safe: no hooks. Artwork units are the mark's 512 × 512; the jar is centred on (256, 256).

/** A one-off move when something happens: a cheer for a right answer, a nod for a wrong one. */
export type CoachReaction = "cheer" | "nod" | null;

const LID = { x: 96, y: 58, width: 262, height: 62 };
const LID_CENTRE = { x: LID.x + LID.width / 2, y: LID.y + LID.height / 2 };
const EYE = { left: 200, right: 312, y: 252 };

/** The mark's coin: gold on a teal rim. */
function Coin({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cy={7} rx={50} ry={18} className="fill-teal-800" />
      <ellipse rx={50} ry={18} className="fill-gold" />
    </g>
  );
}

function RoundEye({ x }: { x: number }) {
  return (
    <g>
      <circle cx={x} cy={EYE.y} r={18} className="fill-teal-800" />
      <circle cx={x + 6} cy={EYE.y - 6} r={6} className="fill-card" />
    </g>
  );
}

/** A relaxed, half-closed eye: a short arc. */
function CalmEye({ x }: { x: number }) {
  return (
    <path
      d={`M${x - 18} ${EYE.y} q18 -20 36 0`}
      fill="none"
      strokeWidth={14}
      strokeLinecap="round"
      className="stroke-teal-800"
    />
  );
}

/** A wink: an arc the other way. */
function WinkEye({ x }: { x: number }) {
  return (
    <path
      d={`M${x - 18} ${EYE.y - 6} q18 20 36 0`}
      fill="none"
      strokeWidth={14}
      strokeLinecap="round"
      className="stroke-teal-800"
    />
  );
}

const faces: Record<CoachId, { lidTilt: number; lidCoin: boolean; face: React.ReactNode }> = {
  // Pip: curious. Lid tipped back, wide eyes, a small open mouth.
  pip: {
    lidTilt: -9,
    lidCoin: false,
    face: (
      <>
        <RoundEye x={EYE.left} />
        <RoundEye x={EYE.right} />
        <ellipse cx={256} cy={330} rx={16} ry={20} className="fill-teal-800" />
      </>
    ),
  },
  // Bo: calm. Lid flat with a coin resting on it, relaxed eyes, a gentle smile.
  bo: {
    lidTilt: 0,
    lidCoin: true,
    face: (
      <>
        <CalmEye x={EYE.left} />
        <CalmEye x={EYE.right} />
        <path
          d="M206 318 q50 36 100 0"
          fill="none"
          strokeWidth={14}
          strokeLinecap="round"
          className="stroke-teal-800"
        />
      </>
    ),
  },
  // Zuzu: cheeky. Lid tipped forward, a wink, a big grin and a sticker on the side.
  zuzu: {
    lidTilt: 8,
    lidCoin: false,
    face: (
      <>
        <RoundEye x={EYE.left} />
        <WinkEye x={EYE.right} />
        <path
          d="M186 312 q70 60 140 0"
          fill="none"
          strokeWidth={14}
          strokeLinecap="round"
          className="stroke-teal-800"
        />
        <circle
          cx={418}
          cy={300}
          r={30}
          strokeWidth={10}
          className="fill-cyan-300 stroke-teal-800"
        />
      </>
    ),
  },
  // Nell: thoughtful. Round glasses and a small, sure smile.
  nell: {
    lidTilt: 0,
    lidCoin: false,
    face: (
      <>
        <RoundEye x={EYE.left} />
        <RoundEye x={EYE.right} />
        <circle
          cx={EYE.left}
          cy={EYE.y}
          r={38}
          fill="none"
          strokeWidth={10}
          className="stroke-teal-800"
        />
        <circle
          cx={EYE.right}
          cy={EYE.y}
          r={38}
          fill="none"
          strokeWidth={10}
          className="stroke-teal-800"
        />
        <path d="M238 252 h36" strokeWidth={10} strokeLinecap="round" className="stroke-teal-800" />
        <path
          d="M226 326 q30 20 60 0"
          fill="none"
          strokeWidth={14}
          strokeLinecap="round"
          className="stroke-teal-800"
        />
      </>
    ),
  },
};

type JarCoachProps = {
  coach: CoachId;
  /** Rendered size in px. */
  size?: number;
  reaction?: CoachReaction;
  /** Accessible name. Omit when the coach's name is written beside it (decorative). */
  label?: string;
  className?: string;
};

/**
 * One of the four lesson coaches: the mark's jar with a face, drawn with the jar's own outline,
 * its cyan lid and its gold coin. A `reaction` plays once (design.md §8: nothing loops); reduced
 * motion shows the still coach.
 */
export function JarCoach({ coach, size = 96, reaction = null, label, className }: JarCoachProps) {
  const { lidTilt, lidCoin, face } = faces[coach];
  return (
    <svg
      viewBox="40 30 440 440"
      width={size}
      height={size}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-coach={coach}
      data-reaction={reaction ?? undefined}
      className={cn(
        "shrink-0 select-none overflow-visible",
        reaction === "cheer" && "motion-safe:animate-[coach-cheer_700ms_var(--ease-brand)_both]",
        reaction === "nod" && "motion-safe:animate-[coach-nod_500ms_var(--ease-brand)_both]",
        className,
      )}
    >
      <path
        d={JAR_OUTLINE_D}
        fill="none"
        strokeWidth={64}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-teal-600 dark:stroke-teal-300"
      />
      {face}
      <g transform={`rotate(${lidTilt} ${LID_CENTRE.x} ${LID_CENTRE.y})`}>
        <rect
          x={LID.x}
          y={LID.y}
          width={LID.width}
          height={LID.height}
          rx={LID.height / 2}
          className="fill-cyan-300"
        />
      </g>
      {lidCoin ? <Coin x={414} y={88} /> : null}
    </svg>
  );
}
