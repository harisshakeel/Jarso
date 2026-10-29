import { Suspense } from "react";
import { ParentNav } from "@/components/shell";

/**
 * Parent area: static shell with the parent tab bar. Pages read the session behind <Suspense>.
 * The tab bar reads the pathname, which is only known at request time on routes with params.
 */
export default function ParentLayout({ children }: LayoutProps<"/parent">) {
  return (
    <>
      {children}
      <Suspense fallback={null}>
        <ParentNav />
      </Suspense>
    </>
  );
}
