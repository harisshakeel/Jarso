import { ChildNav } from "@/components/shell";

/** Child area: static shell with the child tab bar. Pages read the session behind <Suspense>. */
export default function ChildLayout({ children }: LayoutProps<"/child">) {
  return (
    <>
      {children}
      <ChildNav />
    </>
  );
}
