import * as guide from "@jarso/data/guide";
import {
  deleteMemory,
  getMyTranscript,
  listConversations,
  listMemories,
  listMyChats,
  rateMessage,
  toConversation,
} from "@jarso/data/guide";
import { describe, expect, it } from "vitest";
import { type Call, fakeClient, ok } from "../fake-client";

type Convo = {
  id: string;
  child_id: string;
  entry: string;
  context_key: string;
  turns: number;
  flagged: boolean;
  created_at: string;
  last_message_at: string;
  asked_by: string | null;
};

const convo = (over: Partial<Convo> & { id: string }): Convo => ({
  child_id: "child-1",
  entry: "home",
  context_key: "home",
  turns: 2,
  flagged: false,
  created_at: "2026-11-01T10:00:00Z",
  last_message_at: "2026-11-01T10:05:00Z",
  asked_by: null,
  ...over,
});

const line = (id: string, conversationId: string, role: "child" | "guide", text: string) => ({
  id,
  conversation_id: conversationId,
  role,
  text,
  route: role === "guide" ? "on_topic" : null,
  flagged: false,
  rating: null,
  created_at: "2026-11-01T10:00:00Z",
  tool_calls: role === "guide" ? [{ name: "get_jars", input: {} }, { name: "nope" }] : null,
});

/** Applies the eq/is filters the query recorded, like PostgREST would. */
function filtered(rows: Convo[]) {
  return (calls: Call[]) => {
    const kept = rows.filter((row) =>
      calls.every(([method, column, value]) =>
        method === "eq" || method === "is" ? row[column as keyof Convo] === value : true,
      ),
    );
    const single = calls.some(([method]) => method === "maybeSingle");
    return ok(single ? (kept[0] ?? null) : kept);
  };
}

describe("toConversation", () => {
  it("keeps a parent's entry, so their chat is titled as theirs", () => {
    const row = toConversation(convo({ id: "p1", entry: "parent", asked_by: "parent-1" }));
    expect(row.entry).toBe("parent");
    expect(toConversation(convo({ id: "x", entry: "junk" })).entry).toBe("step");
  });
});

describe("listMyChats", () => {
  it("filters asked_by null and lists newest first, titled by the first message", async () => {
    const { db, queries } = fakeClient({
      guide_conversations: filtered([
        convo({ id: "old", last_message_at: "2026-10-30T10:00:00Z" }),
        convo({ id: "new" }),
        convo({ id: "parent", asked_by: "parent-1" }),
      ]),
      guide_messages: ok([
        line("m1", "old", "child", "what is saving?"),
        line("m3", "new", "child", "How much do I have?"),
        line("m4", "new", "guide", "You have £12.40 in Spend."),
      ]),
    });
    const chats = await listMyChats(db, "child-1");
    expect(queries[0]?.calls).toContainEqual(["is", "asked_by", null]);
    expect(queries[0]?.calls).toContainEqual(["eq", "child_id", "child-1"]);
    expect(chats.map((c) => [c.id, c.preview, c.label])).toEqual([
      ["new", "How much do I have?", "Asked from Home"],
      ["old", "what is saving?", "Asked from Home"],
    ]);
  });
});

describe("getMyTranscript", () => {
  const rows = [convo({ id: "mine" }), convo({ id: "asked", asked_by: "parent-1" })];
  const client = () =>
    fakeClient({
      guide_conversations: filtered(rows),
      guide_messages: ok([
        line("m1", "mine", "child", "Hi"),
        line("m2", "mine", "guide", "Hello."),
      ]),
    });

  it("reopens the child's own chat, with what Jarso looked at", async () => {
    const { db, queries } = client();
    const mine = await getMyTranscript(db, "child-1", "mine");
    expect(queries[0]?.calls).toContainEqual(["is", "asked_by", null]);
    expect(mine?.summary.id).toBe("mine");
    expect(mine?.messages.map((m) => [m.role, m.text, m.lookedAt])).toEqual([
      ["child", "Hi", []],
      ["guide", "Hello.", ["jars"]],
    ]);
  });

  it("is null for a parent-asked chat and for another child's chat", async () => {
    await expect(getMyTranscript(client().db, "child-1", "asked")).resolves.toBeNull();
    await expect(getMyTranscript(client().db, "child-2", "mine")).resolves.toBeNull();
  });
});

describe("memories and ratings", () => {
  it("lists unexpired memories of known kinds, newest first", async () => {
    const { db, queries } = fakeClient({
      guide_memories: ok([
        { id: "a", kind: "interest", text: "Likes football", created_at: "t", expires_at: "u" },
        { id: "b", kind: "??", text: "x", created_at: "t", expires_at: "u" },
      ]),
    });
    const memories = await listMemories(db, "child-1");
    expect(memories.map((m) => m.id)).toEqual(["a"]);
    expect(
      queries[0]?.calls.some(([method, column]) => method === "gt" && column === "expires_at"),
    ).toBe(true);
  });

  it("deletes one memory and rates through the function", async () => {
    const { db, queries, rpc } = fakeClient();
    await deleteMemory(db, "m1");
    expect(queries[0]?.calls).toEqual([["delete"], ["eq", "id", "m1"]]);
    await rateMessage(db, "msg-1", 1);
    expect(rpc).toHaveBeenCalledWith("rate_guide_message", { p_message_id: "msg-1", p_rating: 1 });
  });
});

describe("the shared conversation reads", () => {
  // RLS lets a child see every chat about them, a parent's too: the filter is the only guard.
  it("every one filters asked_by null", async () => {
    const reads = [
      (db: guide.Client) => listConversations(db, "child-1"),
      (db: guide.Client) => listMyChats(db, "child-1"),
      (db: guide.Client) => getMyTranscript(db, "child-1", "c1"),
    ];
    for (const read of reads) {
      const { db, queries } = fakeClient({ guide_conversations: filtered([]) });
      await read(db);
      const convoQueries = queries.filter((q) => q.table === "guide_conversations");
      expect(convoQueries.length).toBeGreaterThan(0);
      for (const query of convoQueries)
        expect(query.calls).toContainEqual(["is", "asked_by", null]);
    }
  });

  it("does not export unfiltered reads by id or by parent", () => {
    for (const name of ["findConversation", "listConversationsAskedBy", "listMessages"]) {
      expect(name in guide, name).toBe(false);
    }
  });
});
