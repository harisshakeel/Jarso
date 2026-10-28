import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Suspense } from "react";
import { JarsoMark } from "@/components/brand";
import { Card, CardContent } from "@/components/ui";
import { routes } from "@/config";
import { getChildNickname, requireRole } from "@/features/family/server";

export const metadata: Metadata = { title: "Home" };

const rise = (index: number) => ({ "--rise-index": index }) as CSSProperties;

/** requireRole sends signed-out users to the PIN sign-in and parents to their own home. */
async function ChildHome() {
  await requireRole("child", routes.child);
  const nickname = await getChildNickname();
  return (
    <>
      <h1 className="rise-in text-balance text-display">{nickname ? `Hi, ${nickname}!` : "Hi!"}</h1>
      <JarsComingSoon />
    </>
  );
}

/** design.md §6 Empty state: mark and one sentence. No action yet: jars arrive in a later slice. */
function JarsComingSoon() {
  return (
    <Card className="rise-in shadow-raised" style={rise(1)}>
      <CardContent className="flex flex-col items-center gap-4 text-center">
        <JarsoMark size={64} />
        <p className="text-h3">Your jars are on the way.</p>
        <p className="text-ink-2">Soon you'll see your Spend and Save money here.</p>
      </CardContent>
    </Card>
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
