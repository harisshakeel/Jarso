import { ParentNav } from "@/components/shell";

/** Parent area: static shell with the parent tab bar. Pages read the session behind <Suspense>. */
export default function ParentLayout({ children }: LayoutProps<"/parent">) {
  return (
    <>
      {children}
      <ParentNav />
    </>
  );
}
