import type { Metadata } from "next";
import { Suspense } from "react";
import { AppHeader, InboxRefresh } from "@/components/shell";
import { routes } from "@/config";
import { SignOutButton } from "@/features/auth";
import { OfflineBanner } from "@/features/offline";
import { ProfileGate } from "./profile-gate";

/** Signed-in pages are private: never indexed (robots.ts also keeps crawlers out). */
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Shell for authenticated routes. The shell itself stays static; pages read the user behind
 * <Suspense>. The one session read here is the profile gate (ADR 0008), behind its own
 * Suspense boundary with no fallback, so the shell never waits for it. Role layouts
 * (parent/child) render <BottomNav> with their own tabs; the `has-data-[slot=bottom-nav]`
 * padding keeps content clear of it.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col has-data-[slot=bottom-nav]:pb-[calc(4rem+env(safe-area-inset-bottom))] lg:has-data-[slot=bottom-nav]:pb-0 lg:has-data-[slot=bottom-nav]:pl-24">
      <AppHeader homeHref={routes.dashboard} action={<SignOutButton />} />
      <OfflineBanner />
      <Suspense fallback={null}>
        <InboxRefresh />
      </Suspense>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      <Suspense fallback={null}>
        <ProfileGate />
      </Suspense>
    </div>
  );
}
