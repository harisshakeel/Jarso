/**
 * System font scaling stays on, but titles and money stop growing at 1.3× so a big amount or a
 * screen title cannot break a 360 dp layout (wave 3 spec §9). Body, small and caption keep scaling.
 */
export const MAX_TITLE_FONT_SCALE = 1.3;

const CAPPED = /(?<![\w-])text-(?:display|h1|h2|h3|money-xl|money-l|money)(?![\w-])/;
const MONEY = /(?<![\w-])text-(?:money-xl|money-l|money)(?![\w-])/;

/** `MAX_TITLE_FONT_SCALE` when the classes hold a title or money size token, else undefined. */
export function fontScaleCap(className?: string): number | undefined {
  return className && CAPPED.test(className) ? MAX_TITLE_FONT_SCALE : undefined;
}

/** Whether the classes hold a money size token (those get tabular figures). */
export function isMoneyClass(className?: string): boolean {
  return !!className && MONEY.test(className);
}
