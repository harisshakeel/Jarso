import type { Metadata } from "next";
import { Suspense } from "react";
import { AppHeader, InboxRefresh } from "@/components/shell";
import { routes } from "@/config";
import { OfflineBanner } from "@/features/offline";
import { HeaderAvatar } from "./header-avatar";
import { ProfileGate } from "./profile-gate";

/** Signed-in pages are private: never indexed (robots.ts also keeps crawlers out). */
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Shell for authenticated routes (design.md §5). The shell itself stays static; pages read the
 * user behind <Suspense>. The one session read here is the profile gate (ADR 0008), behind its
 * own Suspense boundary with no fallback, so the shell never waits for it. Role layouts render
 * the navigation (`data-slot=bottom-nav`): a bottom bar on phones, a sidebar from 768 px. The
 * `has-data-[slot=bottom-nav]` rules keep content clear of it, and the header only shows where
 * there is no sidebar (phones, and the role-less pages such as /invite). Theme and sign out live
 * in Settings, so the header holds just the mark and the person.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="group/app flex flex-1 flex-col has-data-[slot=bottom-nav]:pb-[calc(4rem+env(safe-area-inset-bottom))] md:has-data-[slot=bottom-nav]:pb-0 md:has-data-[slot=bottom-nav]:pl-24 lg:has-data-[slot=bottom-nav]:pl-64">
      <AppHeader
        homeHref={routes.home}
        className="md:group-has-data-[slot=bottom-nav]/app:hidden"
        end={<HeaderAvatar />}
      />
      <OfflineBanner />
      <Suspense fallback={null}>
        <InboxRefresh />
      </Suspense>
      {/* The floating Jarso (child pages) sits over the bottom right: room below the last item. */}
      <main className="w-full flex-1 px-4 py-6 has-data-[slot=jarso-buddy]:pb-24 sm:px-6 md:py-8 md:has-data-[slot=jarso-buddy]:pb-24 lg:px-10">
        {children}
      </main>
      <Suspense fallback={null}>
        <ProfileGate />
      </Suspense>
    </div>
  );
}
