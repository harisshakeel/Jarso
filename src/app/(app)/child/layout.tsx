import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { ChildNav } from "@/components/shell";
import { getCurrentUser } from "@/features/auth/server";
import { currentRole } from "@/features/family/server";
import { getUnreadCount } from "@/features/notifications/server";
import { OutboxSync } from "@/features/offline";
import { logger } from "@/lib";

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
        <Suspense fallback={<ChildNav />}>
          <ChildNavWithCount />
        </Suspense>
      </Suspense>
      <Suspense fallback={null}>
        <ChildOutboxSync />
      </Suspense>
    </>
  );
}

/** The tab bar with the Inbox count. Without a session or on a read error it shows no count. */
async function ChildNavWithCount() {
  try {
    return <ChildNav unread={await getUnreadCount()} />;
  } catch (error) {
    unstable_rethrow(error);
    return <ChildNav />;
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
