import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { ParentNav } from "@/components/shell";
import { getCurrentUser } from "@/features/auth/server";
import { currentRole, getFamily } from "@/features/family/server";
import { NoticeListener } from "@/features/notifications";
import { getUnreadCount } from "@/features/notifications/server";
import { logger } from "@/lib";

/**
 * Parent area: static shell with the parent tab bar. Pages read the session behind <Suspense>.
 * The tab bar reads the pathname, which is only known at request time on routes with params.
 */
export default function ParentLayout({ children }: LayoutProps<"/parent">) {
  return (
    <>
      {children}
      <Suspense fallback={null}>
        <Suspense fallback={<ParentNav />}>
          <ParentNavWithCount />
        </Suspense>
      </Suspense>
      <Suspense fallback={null}>
        <ParentNoticeListener />
      </Suspense>
    </>
  );
}

/** The tab bar with the Inbox count. Without a session or on a read error it shows no count. */
async function ParentNavWithCount() {
  try {
    return <ParentNav unread={await getUnreadCount()} />;
  } catch (error) {
    unstable_rethrow(error);
    return <ParentNav />;
  }
}

/** Live Inbox updates for the signed-in parent. Nothing for anyone else; on error the count updates on navigation. */
async function ParentNoticeListener() {
  try {
    const user = await getCurrentUser();
    if (!user || (await currentRole()) !== "parent") return null;
    const family = await getFamily();
    return <NoticeListener userId={user.id} viewer="parent" currency={family?.currency ?? "USD"} />;
  } catch (error) {
    unstable_rethrow(error);
    logger.warn("Live inbox unavailable", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return null;
  }
}
