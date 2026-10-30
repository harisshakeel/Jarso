import "fake-indexeddb/auto";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { open } from "./store";
import { makeItem } from "./test-utils";
import { useOutbox } from "./use-outbox";

describe("useOutbox", () => {
  it("shows only the current user's items and follows changes", async () => {
    const store = await open();
    if (!store) throw new Error("fake IndexedDB should open");
    const userA = crypto.randomUUID();
    const mine = makeItem({ userId: userA });
    await store.put(mine);
    await store.put(makeItem({ userId: crypto.randomUUID() }));

    const { result } = renderHook(() => useOutbox(userA));
    await waitFor(() => expect(result.current.map((i) => i.id)).toEqual([mine.id]));

    await store.remove(mine.id);
    await waitFor(() => expect(result.current).toEqual([]));
  });
});
