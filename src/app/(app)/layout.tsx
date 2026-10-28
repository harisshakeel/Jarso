import Link from "next/link";
import { routes, siteConfig } from "@/config";
import { SignOutButton } from "@/features/auth";

/** Shell for authenticated routes. No session read here — keep it static; pages read the user behind <Suspense>. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-6">
          <Link href={routes.dashboard} className="font-semibold">
            {siteConfig.name}
          </Link>
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
