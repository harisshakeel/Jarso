export type OptionArt =
  | { kind: "emoji"; emoji: string }
  | { kind: "letter"; letter: "A" | "B" | "C" | "D" };

/**
 * Category pictures for answer options, in priority order. Emoji are allowed here (spec: category
 * art in lesson questions). Matches are whole words ("unsaved" is not "save"). The art
 * never shows a number and never names a money idea (saving, nothing, weeks), so it can't give
 * the answer away.
 */
export const OPTION_ART_WORDS: readonly (readonly [RegExp, string])[] = [
  [/\bcomics?\b/i, "📖"],
  [/\bheadphones?\b/i, "🎧"],
  [/\bgames?\b/i, "🎮"],
  [/\bbooks?\b/i, "📚"],
  [/\b(snacks?|biscuits?|crisps)\b/i, "🍪"],
  [/\bcap\b/i, "🧢"],
  [/\bkeyrings?\b/i, "🔑"],
  [/\b(tickets?|cinema|films?)\b/i, "🎟️"],
];

const LETTERS = ["A", "B", "C", "D"] as const;

/** A picture for an option, from keywords in its text; a letter tile when nothing matches. */
export function optionArt(text: string, index: number): OptionArt {
  for (const [pattern, emoji] of OPTION_ART_WORDS) {
    if (pattern.test(text)) return { kind: "emoji", emoji };
  }
  return { kind: "letter", letter: LETTERS[Math.min(Math.max(index, 0), 3)] ?? "A" };
}

/**
 * Art for all the options of one step. A picture two options share would say nothing, so those
 * options get their letter tile instead.
 */
export function optionArts(texts: readonly string[]): OptionArt[] {
  const arts = texts.map((text, i) => optionArt(text, i));
  return arts.map((art, i) =>
    art.kind === "emoji" &&
    arts.filter((o) => o.kind === "emoji" && o.emoji === art.emoji).length > 1
      ? { kind: "letter", letter: LETTERS[Math.min(i, 3)] ?? "A" }
      : art,
  );
}
