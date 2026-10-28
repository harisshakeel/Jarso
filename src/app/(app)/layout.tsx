import { AppHeader } from "@/components/shell";
import { routes } from "@/config";
import { SignOutButton } from "@/features/auth";

/**
 * Shell for authenticated routes. No session read here — keep it static; pages read the user
 * behind <Suspense>. Role layouts (parent/child) render <BottomNav> with their own tabs; the
 * `has-data-[slot=bottom-nav]` padding keeps content clear of it.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col has-data-[slot=bottom-nav]:pb-[calc(4rem+env(safe-area-inset-bottom))] lg:has-data-[slot=bottom-nav]:pb-0 lg:has-data-[slot=bottom-nav]:pl-24">
      <AppHeader homeHref={routes.dashboard} action={<SignOutButton />} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
