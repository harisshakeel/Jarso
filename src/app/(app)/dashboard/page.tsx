import type { Metadata } from "next";
import { Suspense } from "react";
import { routes } from "@/config";
import { requireUser } from "@/features/auth/server";
import { ProfileCard } from "@/features/profiles";
import { getProfile } from "@/features/profiles/server";

export const metadata: Metadata = { title: "Dashboard" };

async function DashboardContent() {
  const user = await requireUser(routes.dashboard);
  const profile = await getProfile(user.id);
  return <ProfileCard profile={profile} email={user.email} />;
}

export default function DashboardPage() {
  return (
    <div className="grid gap-6">
      <h1 className="font-semibold text-2xl">Dashboard</h1>
      <Suspense fallback={<div className="h-32 animate-pulse rounded-xl bg-muted" />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}
