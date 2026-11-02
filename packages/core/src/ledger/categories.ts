// Fixed lists of what money was for or where it came from. Client-safe: no server imports.
// The keys are checked again in SQL (record_purchase, record_money_received, correct_diary_entry).

export type CategoryOption<K extends string> = { key: K; emoji: string; label: string };

export const SPEND_CATEGORIES = [
  { key: "snacks", emoji: "🍫", label: "Snacks" },
  { key: "games", emoji: "🎮", label: "Games" },
  { key: "clothes", emoji: "👕", label: "Clothes" },
  { key: "going_out", emoji: "🎟️", label: "Going out" },
  { key: "gift_for_someone", emoji: "🎁", label: "A gift" },
  { key: "school", emoji: "✏️", label: "School" },
  { key: "travel", emoji: "🚌", label: "Travel" },
  { key: "apps", emoji: "📱", label: "Apps" },
  { key: "other", emoji: "✨", label: "Other" },
] as const satisfies readonly CategoryOption<string>[];

export const RECEIVED_CATEGORIES = [
  { key: "family", emoji: "👪", label: "Family" },
  { key: "birthday", emoji: "🎂", label: "Birthday" },
  { key: "job", emoji: "🧹", label: "Did a job" },
  { key: "sold", emoji: "🏷️", label: "Sold something" },
  { key: "found", emoji: "🪙", label: "Found it" },
  { key: "other", emoji: "✨", label: "Other" },
] as const satisfies readonly CategoryOption<string>[];

export type SpendCategory = (typeof SPEND_CATEGORIES)[number]["key"];
export type ReceivedCategory = (typeof RECEIVED_CATEGORIES)[number]["key"];

/** The option for a stored key. A missing or unknown key reads as Other (old purchases have none). */
export function categoryOf(
  key: string | null,
  kind: "purchase" | "received",
): CategoryOption<string> {
  const list: readonly CategoryOption<string>[] =
    kind === "purchase" ? SPEND_CATEGORIES : RECEIVED_CATEGORIES;
  return (
    list.find((c) => c.key === key) ??
    (list.find((c) => c.key === "other") as CategoryOption<string>)
  );
}
