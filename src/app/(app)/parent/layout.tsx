import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { ParentNav } from "@/components/shell";
import { getUnreadCount } from "@/features/notifications/server";

/**
 * Parent area: static shell with the parent tab bar. Pages read the session behind <Suspense>.
 * The tab bar reads the pathname, which is only known at request time on routes with params.
 */
export default function ParentLayout({ children }: LayoutProps<"/parent">) {
  return (
    <>
      {children}
      <Suspense fallback={null}>
        <ParentNavWithCount />
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
