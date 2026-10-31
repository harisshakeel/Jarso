import type { ParentRequestItem } from "./components/parent-request-items";
import type { SavingsRequest } from "./types";

/** Merges per-child reads: requests from the children that loaded, nicknames of those that did not. */
export function settleRequestReads(
  nicknames: string[],
  results: PromiseSettledResult<SavingsRequest[]>[],
): {
  items: ParentRequestItem[];
  failed: string[];
} {
  const items: ParentRequestItem[] = [];
  const failed: string[] = [];
  for (const [index, result] of results.entries()) {
    const nickname = nicknames[index] ?? "";
    if (result.status === "fulfilled") {
      for (const request of result.value) items.push({ nickname, request });
    } else {
      failed.push(nickname);
    }
  }
  return { items, failed };
}
