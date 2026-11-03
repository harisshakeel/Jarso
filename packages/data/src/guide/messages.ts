import { toAppError } from "@jarso/core/lib";
import { type Client, MESSAGE_COLUMNS, type MessageRow, toMessage } from "./repository";

/**
 * Messages of the given chats. Module-internal (not in the barrel): ids alone don't say whose
 * chat it is, so this only runs after a lookup filtered to the child's own chats.
 */
export async function listMessages(
  db: Client,
  conversationIds: readonly string[],
): Promise<MessageRow[]> {
  if (conversationIds.length === 0) return [];
  const { data, error } = await db
    .from("guide_messages")
    .select(MESSAGE_COLUMNS)
    .in("conversation_id", [...conversationIds])
    .order("created_at", { ascending: true })
    .order("role", { ascending: true });
  if (error) throw toAppError(error, "Failed to load the chat");
  return data.map(toMessage);
}
