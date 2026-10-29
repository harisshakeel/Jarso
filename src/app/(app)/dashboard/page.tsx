import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { routes } from "@/config";
import { requireRole } from "@/features/family/server";

export const metadata: Metadata = { title: "Home" };

/**
 * Role router. requireRole sends signed-out users to login and children to their own home;
 * a parent goes to setup until their family exists, then to the parent home.
 */
async function RoleRedirect(): Promise<null> {
  const { membership } = await requireRole("parent", routes.dashboard);
  redirect(membership ? routes.parent : routes.parentSetup);
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div aria-hidden className="shimmer h-32 rounded-xl bg-muted" />}>
      <RoleRedirect />
    </Suspense>
  );
}
