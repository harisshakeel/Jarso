// Public, client-safe API of the notifications feature. Server-only API: "@/features/notifications/server".

export { InboxItem } from "./components/inbox-item";
export { InboxList } from "./components/inbox-list";
export { NoticeListener } from "./components/notice-listener";
export { UnreadNotices } from "./components/unread-notices";
export { noticeHref, noticeText } from "./links";
export { inboxParamsSchema, markReadSchema } from "./schemas";
export type * from "./types";
