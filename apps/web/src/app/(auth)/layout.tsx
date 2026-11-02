import type { Metadata } from "next";
import { ThemeSwitch } from "@/components/theme";

/** Sign-in and sign-up forms carry no content worth a search result; links stay followable. */
export const metadata: Metadata = { robots: { index: false, follow: true } };

/**
 * No header on these pages, so the theme switch sits top-right and scrolls with the page
 * (design.md §5, §12). Stays static.
 */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="relative flex flex-1 flex-col">
      <div className="absolute top-[env(safe-area-inset-top)] right-[max(0.5rem,env(safe-area-inset-right))] z-40">
        <ThemeSwitch />
      </div>
      <main className="flex flex-1 items-center justify-center px-6 py-12">{children}</main>
    </div>
  );
}
