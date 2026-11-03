/**
 * Section tones (design.md §2.7). Literal class strings so Tailwind sees them. Home and money
 * are teal, the diary and Save are gold, learning is cyan, Jarso the AI is grape.
 */
export type Tone = "teal" | "gold" | "cyan" | "grape" | "neutral";

/** A tinted disc behind an icon: tint fill, the tone's text colour. */
export const toneIcon: Record<Tone, string> = {
  teal: "bg-tint-teal text-primary",
  gold: "bg-tint-gold text-gold-text",
  cyan: "bg-tint-cyan text-accent-text",
  grape: "bg-tint-grape text-ai-text",
  neutral: "bg-muted text-ink-2",
};

/** The active nav item: tint pill, the tone's text colour. */
export const toneActive: Record<Tone, string> = {
  teal: "bg-tint-teal text-primary",
  gold: "bg-tint-gold text-gold-text",
  cyan: "bg-tint-cyan text-accent-text",
  grape: "bg-tint-grape text-ai-text",
  neutral: "bg-muted text-foreground",
};
