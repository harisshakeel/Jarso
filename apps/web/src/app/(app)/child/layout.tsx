import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { ChildNav } from "@/components/shell";
import { routes } from "@/config";
import { getCurrentUser } from "@/features/auth/server";
import { currentRole, getFamily } from "@/features/family/server";
import { JarsoBuddy } from "@/features/guide";
import { getGuideState } from "@/features/guide/server";
import { NoticeListener } from "@/features/notifications";
import { getUnreadCount } from "@/features/notifications/server";
import { OutboxSync } from "@/features/offline";
import { logger } from "@/lib";
import { RailAvatar } from "../header-avatar";

/**
 * Child area: static shell with the child tab bar. Pages read the session behind <Suspense>.
 * The tab bar reads the pathname, which is only known at request time on routes with params
 * (a mission or topic page), so it renders behind its own boundary like the parent's.
 */
export default function ChildLayout({ children }: LayoutProps<"/child">) {
  return (
    <>
      {children}
      <Suspense fallback={null}>
        <Suspense
          fallback={<ChildNav footer={<RailAvatar href={routes.childSettings} label="Me" />} />}
        >
          <ChildNavWithCount />
        </Suspense>
      </Suspense>
      <Suspense fallback={null}>
        <ChildNoticeListener />
      </Suspense>
      <Suspense fallback={null}>
        <ChildOutboxSync />
      </Suspense>
      <Suspense fallback={null}>
        <ChildJarsoBuddy />
      </Suspense>
    </>
  );
}

/** The tab bar with the Inbox count. Without a session or on a read error it shows no count. */
async function ChildNavWithCount() {
  try {
    return (
      <ChildNav
        unread={await getUnreadCount()}
        footer={<RailAvatar href={routes.childSettings} label="Me" />}
      />
    );
  } catch (error) {
    unstable_rethrow(error);
    return <ChildNav footer={<RailAvatar href={routes.childSettings} label="Me" />} />;
  }
}

/** Jarso in the corner of every child page, only when the parent has Jarso on for this child. */
async function ChildJarsoBuddy() {
  try {
    const user = await getCurrentUser();
    if (!user || (await currentRole()) !== "child") return null;
    const state = await getGuideState(user.id);
    return state.available ? <JarsoBuddy introNeeded={state.introNeeded} /> : null;
  } catch (error) {
    unstable_rethrow(error);
    return null;
  }
}

/** Sends the signed-in child's saved actions from any child page. Nothing for anyone else. */
async function ChildOutboxSync() {
  try {
    const user = await getCurrentUser();
    if (!user || (await currentRole()) !== "child") return null;
    return <OutboxSync userId={user.id} />;
  } catch (error) {
    unstable_rethrow(error);
    // The page itself shows a slow or failed session; sending waits for the next page.
    logger.warn("Outbox sync unavailable", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return null;
  }
}

/** Live Inbox updates for the signed-in child. Nothing for anyone else; on error the count updates on navigation. */
async function ChildNoticeListener() {
  try {
    const user = await getCurrentUser();
    if (!user || (await currentRole()) !== "child") return null;
    const family = await getFamily();
    return <NoticeListener userId={user.id} viewer="child" currency={family?.currency ?? "USD"} />;
  } catch (error) {
    unstable_rethrow(error);
    logger.warn("Live inbox unavailable", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return null;
  }
}
