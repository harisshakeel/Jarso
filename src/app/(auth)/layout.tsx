import { ThemeSwitch } from "@/components/theme";

/** No header on these pages, so the theme switch sits top-right (design.md §5, §12). Stays static. */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <div className="fixed top-[env(safe-area-inset-top)] right-2 z-40">
        <ThemeSwitch />
      </div>
      <main className="flex flex-1 items-center justify-center px-6 py-12">{children}</main>
    </>
  );
}
