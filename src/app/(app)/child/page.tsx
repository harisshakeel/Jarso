import type { Metadata } from "next";
import { Suspense } from "react";
import { routes } from "@/config";
import { ChildAllowanceCard } from "@/features/allowance";
import { getFamilyContext, getSchedule, listDueForChild } from "@/features/allowance/server";
import { getChildNickname, requireRole } from "@/features/family/server";
import { HistoryList, Jars } from "@/features/ledger";
import { getHistory, getJars } from "@/features/ledger/server";

export const metadata: Metadata = { title: "Home" };

/** requireRole sends signed-out users to the PIN sign-in and parents to their own home. */
async function ChildHome() {
  const { user } = await requireRole("child", routes.child);
  const [nickname, family, jars, history, schedule, due] = await Promise.all([
    getChildNickname(),
    getFamilyContext(),
    getJars(user.id),
    getHistory(user.id),
    getSchedule(user.id),
    listDueForChild(user.id),
  ]);
  return (
    <>
      <h1 className="rise-in text-balance text-display">{nickname ? `Hi, ${nickname}!` : "Hi!"}</h1>
      <Jars jars={jars} currency={family.currency} />
      <ChildAllowanceCard
        schedule={schedule}
        dueTotalMinor={due.totalMinor}
        currency={family.currency}
      />
      <HistoryList items={history} currency={family.currency} />
    </>
  );
}

function HomeSkeleton() {
  return (
    <div aria-hidden className="grid gap-6">
      <div className="shimmer h-11 w-48 rounded-lg bg-muted" />
      <div className="shimmer h-44 rounded-xl bg-muted" />
    </div>
  );
}

export default function ChildHomePage() {
  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <Suspense fallback={<HomeSkeleton />}>
        <ChildHome />
      </Suspense>
    </div>
  );
}
