import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SlowFallback } from "@/components/shell";
import { routes } from "@/config";
import { requireUser } from "@/features/auth/server";
import { currentRole } from "@/features/family/server";

export const metadata: Metadata = { title: "Settings" };

/** The header's gear link is role-agnostic; this sends each role to its own settings page. */
async function RoleRedirect(): Promise<null> {
  await requireUser(routes.settings);
  const role = await currentRole();
  redirect(role === "child" ? routes.childSettings : routes.parentSettings);
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <SlowFallback>
          <div aria-hidden className="shimmer h-32 rounded-xl bg-muted" />
        </SlowFallback>
      }
    >
      <RoleRedirect />
    </Suspense>
  );
}
