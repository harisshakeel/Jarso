import {
  countFlaggedSince,
  findGuideAccess,
  getAskerTranscript,
  getChildTranscript,
  listChatsAskedBy,
  listChildChats,
  saveGuideAccess,
} from "@jarso/data/guide";
import { describe, expect, it } from "vitest";
import { type Call, fakeClient, ok } from "../fake-client";

// Parent-side chat reads: a child's chats as their parent sees them, and the parent's own chats.

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

const line = (
  id: string,
  conversationId: string,
  role: "child" | "guide" | "fixed_copy",
  text: string,
  route: string | null = role === "child" ? null : "on_topic",
) => ({
  id,
  conversation_id: conversationId,
  role,
  text,
  route,
  flagged: route === "safety",
  rating: null,
  created_at: "2026-11-01T10:00:00Z",
  tool_calls: role === "guide" ? [{ name: "get_jars", input: {} }] : null,
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

describe("listChildChats", () => {
  it("flagged first, as the read orders them, each titled by its first message", async () => {
    const { db, queries } = fakeClient({
      guide_conversations: filtered([
        convo({ id: "flagged", flagged: true, last_message_at: "2026-10-30T10:00:00Z" }),
        convo({ id: "plain" }),
      ]),
      guide_messages: ok([
        line("m1", "flagged", "child", "", null),
        line("m2", "flagged", "fixed_copy", "Thank you for telling me.", "safety"),
        line("m3", "plain", "child", "what is saving?"),
      ]),
    });
    const chats = await listChildChats(db, "child-1");
    const calls = queries[0]?.calls ?? [];
    expect(calls).toContainEqual(["is", "asked_by", null]);
    expect(calls.findIndex(([m, c]) => m === "order" && c === "flagged")).toBeLessThan(
      calls.findIndex(([m, c]) => m === "order" && c === "last_message_at"),
    );
    expect(chats.map((c) => [c.id, c.flagged, c.preview])).toEqual([
      ["flagged", true, "A safety response was shown. The message itself is not kept."],
      ["plain", false, "what is saving?"],
    ]);
  });
});

describe("getChildTranscript", () => {
  const client = () =>
    fakeClient({
      guide_conversations: filtered([
        convo({ id: "c1" }),
        convo({ id: "empty", turns: 0 }),
        convo({ id: "other", child_id: "child-2" }),
      ]),
      guide_messages: ok([
        line("m1", "c1", "child", "", null),
        line("m2", "c1", "fixed_copy", "Let's keep personal stuff private.", "personal_info"),
        line("m3", "c1", "child", "what is saving?"),
        line("m4", "c1", "guide", "Keeping money for later."),
      ]),
    });

  it("shows the parent a note where a message wasn't kept", async () => {
    const transcript = await getChildTranscript(client().db, "child-1", "c1");
    expect(transcript?.messages.map((m) => m.text)).toEqual([
      "Personal details were shared, so the message is not kept.",
      "Let's keep personal stuff private.",
      "what is saving?",
      "Keeping money for later.",
    ]);
    expect(transcript?.messages.at(-1)?.lookedAt).toEqual(["jars"]);
  });

  it("other child's conversation → null", async () => {
    await expect(getChildTranscript(client().db, "child-1", "other")).resolves.toBeNull();
  });

  it("an empty chat → null", async () => {
    await expect(getChildTranscript(client().db, "child-1", "empty")).resolves.toBeNull();
  });
});

describe("the parent's own chats", () => {
  const rows = [
    convo({ id: "p1", entry: "parent", context_key: "parent:child-1", asked_by: "parent-1" }),
    convo({ id: "p2", entry: "parent", context_key: "parent:child-1", asked_by: "parent-2" }),
    convo({ id: "c1" }),
  ];
  const client = () =>
    fakeClient({
      guide_conversations: filtered(rows),
      guide_messages: ok([
        line("m1", "p1", "child", "How is Sam doing with saving?"),
        line("m2", "p1", "guide", "Sam has £64 in Save."),
      ]),
    });

  it("lists only chats the parent asked", async () => {
    const { db, queries } = client();
    const chats = await listChatsAskedBy(db, "parent-1");
    expect(queries[0]?.calls).toContainEqual(["eq", "asked_by", "parent-1"]);
    expect(chats).toHaveLength(1);
    expect(chats[0]).toMatchObject({
      id: "p1",
      childId: "child-1",
      preview: "How is Sam doing with saving?",
      label: "A parent asked about them",
    });
  });

  it("reopens the parent's own chat", async () => {
    const transcript = await getAskerTranscript(client().db, "parent-1", "p1");
    expect(transcript?.messages).toHaveLength(2);
  });

  it("someone else's chat → null", async () => {
    await expect(getAskerTranscript(client().db, "parent-1", "p2")).resolves.toBeNull();
    await expect(getAskerTranscript(client().db, "parent-1", "c1")).resolves.toBeNull();
  });
});

describe("guide access and flags", () => {
  it("is on by default and off only when a parent turned it off", async () => {
    await expect(findGuideAccess(fakeClient().db, "child-1")).resolves.toBe(true);
    const off = fakeClient({ guide_access: ok({ enabled: false }) });
    await expect(findGuideAccess(off.db, "child-1")).resolves.toBe(false);
  });

  it("saves through set_guide_access", async () => {
    const { db, rpc } = fakeClient();
    await saveGuideAccess(db, "child-1", false);
    expect(rpc).toHaveBeenCalledWith("set_guide_access", {
      p_child_id: "child-1",
      p_enabled: false,
    });
  });

  it("counts the child's own flagged chats since an instant", async () => {
    const { db, queries } = fakeClient({ guide_conversations: { data: null, error: null } });
    await expect(countFlaggedSince(db, "child-1", "2026-10-01T00:00:00Z")).resolves.toBe(0);
    expect(queries[0]?.calls).toContainEqual(["is", "asked_by", null]);
    expect(queries[0]?.calls).toContainEqual(["gte", "last_message_at", "2026-10-01T00:00:00Z"]);
  });
});
