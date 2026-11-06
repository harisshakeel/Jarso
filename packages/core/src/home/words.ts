// The child app's word budget: short labels, short bubbles, a short Home.

export const BUBBLE_MAX_WORDS = 8;
export const LABEL_MAX_WORDS = 3;
export const HOME_MAX_WORDS = 30;

const SYMBOLS = new Set(["·", "→"]);

/** Words in a line. Spaces split words; "·" and "→" do not count; "₹40" is one word. */
export function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => w !== "" && !SYMBOLS.has(w)).length;
}

/** The line with its first letter in capitals, for sentence starts. */
export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
