import "server-only";

/**
 * Figures in Jarso's replies (ADR 0011). A tool never hands the model a bare figure to repeat:
 * each one comes with a ref like `{{jars.save}}`, and the model writes the ref. The server fills
 * every ref from what the tool returned, so a figure a child reads about their own money is the
 * app's figure, never the model's arithmetic or memory. A ref the tools never returned holds the
 * whole reply back.
 */

/** One turn's looked-up figures: ref key → the text the child sees ("£30.00", "Fri 6 Nov"). */
export type Facts = Map<string, string>;

const KEY = /^[a-z][a-z0-9_.]{0,47}$/;
const REF = /\{\{\s*([^{}]*?)\s*\}\}/g;
/** Anything left that looks like a ref after filling: `{jars.save}`, `{{`, `}}`. */
const LEFTOVER = /\{\{|\}\}|\{[a-z][a-z0-9_.]*\}/;

/**
 * Records a figure and returns what the model sees for it. A ref is never rebound to a different
 * figure: one ref, one figure, or the reply could show the wrong one.
 */
export function addFact(facts: Facts, key: string, shown: string): { ref: string; value: string } {
  if (!KEY.test(key)) throw new Error(`Bad fact key: ${key}`);
  const existing = facts.get(key);
  if (existing !== undefined && existing !== shown) throw new Error(`Fact rebound: ${key}`);
  facts.set(key, shown);
  return { ref: `{{${key}}}`, value: shown };
}

/**
 * Replaces every ref with its figure. `unknown` lists refs the tools never returned and any
 * ref-like leftovers; a non-empty list means the reply must not be shown.
 */
export function fillFacts(text: string, facts: Facts): { text: string; unknown: string[] } {
  const unknown: string[] = [];
  const filled = text.replace(REF, (whole, key: string) => {
    const value = facts.get(key);
    if (value === undefined) {
      unknown.push(key || whole);
      return whole;
    }
    return value;
  });
  if (unknown.length === 0 && LEFTOVER.test(filled)) unknown.push("malformed");
  return { text: filled, unknown };
}

/** The figures as lines, for the output screen to check the reply against. */
export function describeFacts(facts: Facts): string {
  if (facts.size === 0) return "No figures were looked up for this reply.";
  return [
    "Figures the app looked up for this reply (the only figures about the child's own money it may state):",
    ...[...facts].map(([key, value]) => `- ${key}: ${value}`),
  ].join("\n");
}
