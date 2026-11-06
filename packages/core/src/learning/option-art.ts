export type OptionArt =
  | { kind: "emoji"; emoji: string }
  | { kind: "letter"; letter: "A" | "B" | "C" | "D" };

/**
 * Category pictures for answer options, in priority order. Emoji are allowed here (spec: category
 * art in lesson questions). The art never shows a number, so it can't give the answer away.
 */
export const OPTION_ART_WORDS: readonly (readonly [RegExp, string])[] = [
  [/\bcomic/i, "📖"],
  [/headphone/i, "🎧"],
  [/\bgame/i, "🎮"],
  [/\bbook/i, "📚"],
  [/snack|biscuit|crisps/i, "🍪"],
  [/\bcap\b/i, "🧢"],
  [/keyring/i, "🔑"],
  [/ticket|cinema|film/i, "🎟️"],
  [/weeks?\b/i, "📅"],
  [/save|saving/i, "🐷"],
  [/nothing/i, "🤷"],
];

const LETTERS = ["A", "B", "C", "D"] as const;

/** A picture for an option, from keywords in its text; a letter tile when nothing matches. */
export function optionArt(text: string, index: number): OptionArt {
  for (const [pattern, emoji] of OPTION_ART_WORDS) {
    if (pattern.test(text)) return { kind: "emoji", emoji };
  }
  return { kind: "letter", letter: LETTERS[Math.min(Math.max(index, 0), 3)] ?? "A" };
}
