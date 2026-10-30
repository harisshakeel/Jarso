import type { CSSProperties } from "react";
import { easeInOut, segment } from "../motion";

// The hero's kid, drawn like the jar mark (design.md §7): thick round-ended strokes, flat fills,
// a cyan hoodie like the lid and teal trousers like the jar. Gold stays for coins. Units are scene
// units with the origin between the feet; y grows downward.

/** One frame of the kid: crouch, hop, arm angles, gaze and expression. */
export type KidPose = {
  /** Hips lowered by this much (negative stands taller). */
  crouch: number;
  /** Whole body lifted off the ground. */
  hop: number;
  /** Arm angles in degrees from straight down; positive swings to the kid's right (screen right). */
  rightArm: number;
  leftArm: number;
  /** How far the arms stretch, 0 to 1: bent at the elbow when holding, straight when throwing. */
  reach: number;
  /** Gaze, -1 to 1 on each axis. */
  lookX: number;
  lookY: number;
  /** Unsure about the coins, smiling, or cheering with an open mouth. */
  mood: "unsure" | "smile" | "cheer";
};

type Key = { at: number } & Omit<KidPose, "hop" | "mood">;

// Keyframes for the opening and the throw (hero progress 0 to 0.2); poses between them ease in
// and out. After the throw the view follows the coins up and the kid leaves the frame.
const KEYS: readonly Key[] = [
  { at: 0, crouch: 0, rightArm: -10, leftArm: 10, reach: 0.68, lookX: 0, lookY: 1 },
  { at: 0.05, crouch: 0, rightArm: -10, leftArm: 10, reach: 0.68, lookX: 0, lookY: 1 },
  { at: 0.09, crouch: 18, rightArm: -6, leftArm: 6, reach: 0.72, lookX: 0, lookY: 0.6 },
  { at: 0.115, crouch: -8, rightArm: 148, leftArm: -148, reach: 1, lookX: 0, lookY: -1 },
  { at: 0.2, crouch: 0, rightArm: 156, leftArm: -156, reach: 1, lookX: 0, lookY: -1 },
];

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** The two keyframes either side of `p`. */
function bracket(p: number): [Key, Key] {
  for (let index = 1; index < KEYS.length; index++) {
    const from = KEYS[index - 1];
    const to = KEYS[index];
    if (from && to && p < to.at) return [from, to];
  }
  const end = KEYS[KEYS.length - 1] as Key;
  return [end, end];
}

/** The kid's pose at hero progress `p`. */
export function kidPose(p: number): KidPose {
  const [from, to] = bracket(p);
  const t = to.at > from.at ? easeInOut(segment(p, from.at, to.at)) : 1;
  return {
    crouch: mix(from.crouch, to.crouch, t),
    hop: Math.sin(Math.PI * segment(p, 0.095, 0.15)) * 26,
    rightArm: mix(from.rightArm, to.rightArm, t),
    leftArm: mix(from.leftArm, to.leftArm, t),
    reach: mix(from.reach, to.reach, t),
    lookX: mix(from.lookX, to.lookX, t),
    lookY: mix(from.lookY, to.lookY, t),
    mood: p < 0.08 ? "unsure" : p < 0.105 ? "smile" : "cheer",
  };
}

const ARM = 74;
const SHOULDER_Y = -158;

function hand(pose: KidPose, side: 1 | -1) {
  const angle = ((side === 1 ? pose.rightArm : pose.leftArm) * Math.PI) / 180;
  const shoulder = { x: side * 18, y: SHOULDER_Y + pose.crouch - pose.hop };
  return {
    shoulder,
    x: shoulder.x + Math.sin(angle) * ARM * pose.reach,
    y: shoulder.y + Math.cos(angle) * ARM * pose.reach,
  };
}

/** Both hands and the point between them, where the coins sit before the throw. Kid-local units. */
export function kidHands(pose: KidPose) {
  const right = hand(pose, 1);
  const left = hand(pose, -1);
  return {
    right: { x: right.x, y: right.y },
    left: { x: left.x, y: left.y },
    x: (right.x + left.x) / 2,
    y: (right.y + left.y) / 2,
  };
}

function Arm({ pose, side }: { pose: KidPose; side: 1 | -1 }) {
  const { shoulder, x, y } = hand(pose, side);
  // The elbow bends away from the body, more when the arm is drawn in.
  const midX = (shoulder.x + x) / 2 + side * (8 + (1 - pose.reach) * 40);
  const midY = (shoulder.y + y) / 2 + 4;
  return (
    <g>
      <path
        d={`M${shoulder.x} ${shoulder.y}Q${midX} ${midY} ${x} ${y}`}
        fill="none"
        strokeWidth={18}
        strokeLinecap="round"
        className="stroke-cyan-300"
      />
      <circle cx={x} cy={y} r={11} fill="#D9A07A" />
    </g>
  );
}

function Leg({ pose, side }: { pose: KidPose; side: 1 | -1 }) {
  const hip = { x: side * 13, y: -94 + pose.crouch - pose.hop };
  const foot = { x: side * 17, y: -10 - pose.hop };
  // Knees bend outward as the hips drop.
  const knee = { x: (hip.x + foot.x) / 2 + side * pose.crouch * 0.9, y: (hip.y + foot.y) / 2 };
  return (
    <g>
      <path
        d={`M${hip.x} ${hip.y}Q${knee.x} ${knee.y} ${foot.x} ${foot.y}`}
        fill="none"
        strokeWidth={26}
        strokeLinecap="round"
        className="stroke-teal-700 dark:stroke-teal-400"
      />
      <path
        d={`M${foot.x - 4} ${foot.y + 4}L${foot.x + 14} ${foot.y + 4}`}
        strokeWidth={18}
        strokeLinecap="round"
        className="stroke-teal-900 dark:stroke-teal-100"
      />
    </g>
  );
}

// Question marks around the kid's head before the first scroll: each rises, drifts, swells and
// pops like a bubble, on its own loop, so the opening frame stays alive. Offsets are kid-local units; none
// rises past the top of the scene, so they never cross the buttons.
const MARKS = [
  { x: 70, y: -240, dx: 22, rise: 90, size: 1, duration: 3.4, delay: 0 },
  { x: -82, y: -238, dx: -20, rise: 104, size: 0.82, duration: 3.9, delay: 0.8 },
  { x: 112, y: -190, dx: 16, rise: 128, size: 0.7, duration: 4.3, delay: 1.6 },
  { x: -120, y: -176, dx: -14, rise: 120, size: 0.9, duration: 3.7, delay: 2.4 },
  { x: 34, y: -270, dx: 28, rise: 70, size: 0.74, duration: 3.2, delay: 3 },
] as const;

function QuestionMarks({ opacity }: { opacity: number }) {
  return (
    <g opacity={opacity}>
      {MARKS.map((mark) => (
        <g key={mark.delay} transform={`translate(${mark.x} ${mark.y}) scale(${mark.size})`}>
          <g
            style={
              {
                "--qx": `${mark.dx}px`,
                "--qy": `${-mark.rise}px`,
                animationDuration: `${mark.duration}s`,
                animationDelay: `${mark.delay}s`,
                transformBox: "fill-box",
                transformOrigin: "center",
              } as CSSProperties
            }
            className="opacity-0 motion-safe:animate-[qm-bubble_3.6s_ease-out_infinite_both]"
          >
            <text
              y={13}
              fontSize={40}
              fontWeight={800}
              textAnchor="middle"
              className="fill-primary"
            >
              ?
            </text>
          </g>
        </g>
      ))}
    </g>
  );
}

/** `wonder` (0 to 1) shows the floating question marks while the kid is unsure. */
export function KidArt({
  x,
  y,
  pose,
  wonder = 0,
}: {
  x: number;
  y: number;
  pose: KidPose;
  wonder?: number;
}) {
  const lift = pose.crouch - pose.hop;
  const headY = -212 + lift;
  const eyeX = pose.lookX * 4;
  const eyeY = pose.lookY * 3;
  const mouthY = headY + 18;
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse
        cx={0}
        cy={4}
        rx={58 - pose.hop * 0.6}
        ry={9}
        className="fill-foreground"
        opacity={0.07}
      />
      <Leg pose={pose} side={-1} />
      <Leg pose={pose} side={1} />
      <path
        d={`M0 ${-160 + lift}L0 ${-118 + lift}`}
        strokeWidth={70}
        strokeLinecap="round"
        className="stroke-cyan-300"
      />
      <g>
        <circle cx={0} cy={headY} r={38} fill="#D9A07A" />
        <path
          d={`M-39 ${headY + 4}C-45 ${headY - 45} 40 ${headY - 51} 40 ${headY}C30 ${headY - 18} 10 ${headY - 22} -4 ${headY - 14}C-16 ${headY - 24} -31 ${headY - 18} -39 ${headY + 4}Z`}
          fill="#2B1D14"
        />
        <ellipse cx={-22 + eyeX} cy={headY + 15} rx={6.5} ry={4} fill="#F08A6B" opacity={0.45} />
        <ellipse cx={22 + eyeX} cy={headY + 15} rx={6.5} ry={4} fill="#F08A6B" opacity={0.45} />
        <circle cx={-12 + eyeX} cy={headY + 3 + eyeY} r={4.6} fill="#141C1F" />
        <circle cx={12 + eyeX} cy={headY + 3 + eyeY} r={4.6} fill="#141C1F" />
        {pose.mood === "cheer" ? (
          <path
            d={`M${-10 + eyeX} ${mouthY - 2}Q${eyeX} ${mouthY + 15} ${10 + eyeX} ${mouthY - 2}Z`}
            fill="#141C1F"
          />
        ) : (
          <path
            d={
              pose.mood === "unsure"
                ? `M${-8 + eyeX} ${mouthY}Q${-4 + eyeX} ${mouthY - 4} ${eyeX} ${mouthY}Q${4 + eyeX} ${mouthY + 4} ${8 + eyeX} ${mouthY}`
                : `M${-9 + eyeX} ${mouthY - 1}Q${eyeX} ${mouthY + 7} ${9 + eyeX} ${mouthY - 1}`
            }
            fill="none"
            stroke="#141C1F"
            strokeWidth={3.5}
            strokeLinecap="round"
          />
        )}
      </g>
      {/* Both arms in front of the body: the hands meet over the tummy to hold the coins. */}
      <Arm pose={pose} side={-1} />
      <Arm pose={pose} side={1} />
      {wonder > 0 ? <QuestionMarks opacity={wonder} /> : null}
    </g>
  );
}
