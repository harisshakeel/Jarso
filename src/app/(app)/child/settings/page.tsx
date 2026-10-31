import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Suspense } from "react";
import { SlowFallback } from "@/components/shell";
import { ThemeSwitch } from "@/components/theme";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { routes } from "@/config";
import { SignOutButton } from "@/features/auth";
import { getChildNickname, requireRole } from "@/features/family/server";
import { MemoryList } from "@/features/guide";
import { getGuideState, getMemories } from "@/features/guide/server";

export const metadata: Metadata = { title: "Settings" };

const rise = (index: number) => ({ "--rise-index": index }) as CSSProperties;

async function ChildSettings() {
  const { user } = await requireRole("child", routes.childSettings);
  const [nickname, guide] = await Promise.all([getChildNickname(), getGuideState(user.id)]);
  const memories = guide.available ? await getMemories(user.id) : null;
  return (
    <>
      {memories ? (
        <div className="rise-in">
          <MemoryList memories={memories} whose="you" />
        </div>
      ) : null}
      <Card className="rise-in">
        <CardHeader>
          <CardTitle className="text-h2">You</CardTitle>
          <CardDescription>
            {nickname ? `You sign in as ${nickname}.` : "Your nickname is how you sign in."} A
            parent can change your nickname or PIN.
          </CardDescription>
        </CardHeader>
      </Card>
      <Card className="rise-in" style={rise(1)}>
        <CardHeader>
          <CardTitle className="text-h2">Looks</CardTitle>
          <CardDescription>Light, dark, or follow your device.</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeSwitch />
        </CardContent>
      </Card>
      <Card className="rise-in" style={rise(2)}>
        <CardHeader>
          <CardTitle className="text-h2">Done for now?</CardTitle>
          <CardDescription>
            You can sign back in with your family code, nickname and PIN.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignOutButton />
        </CardContent>
      </Card>
    </>
  );
}

export default function ChildSettingsPage() {
  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <h1 className="text-h1">Settings</h1>
      <Suspense
        fallback={
          <SlowFallback>
            <div aria-hidden className="shimmer h-40 rounded-xl bg-muted" />
          </SlowFallback>
        }
      >
        <ChildSettings />
      </Suspense>
    </div>
  );
}
