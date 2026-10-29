import { Suspense } from "react";
import { ChildNav } from "@/components/shell";

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
        <ChildNav />
      </Suspense>
    </>
  );
}
