import { cn } from "cn";
import { LogOutIcon, PaletteIcon, UserRoundIcon } from "lucide-react";
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Suspense } from "react";
import { CoachHead, CoachSays } from "@/components/brand";
import { PageContainer, PageHeader, PageSkeleton, toneIcon } from "@/components/layout";
import { SlowFallback } from "@/components/shell";
import { SoundsToggle } from "@/components/sounds";
import { ThemeChoice } from "@/components/theme";
import { Card, CardContent } from "@/components/ui";
import { routes } from "@/config";
import { SignOutButton } from "@/features/auth";
import { getChildNickname, requireRole } from "@/features/family/server";
import { MemoryList } from "@/features/guide";
import { getGuideState, getMemories } from "@/features/guide/server";
import { PushToggle } from "@/features/notifications";
import { ReplayTourButton } from "@/features/tour";
import { getTour } from "@/features/tour/server";
import { fallback } from "@/lib";

export const metadata: Metadata = { title: "Me" };

const rise = (index: number) => ({ "--rise-index": index }) as CSSProperties;

async function ChildSettings() {
  const { user } = await requireRole("child", routes.childSettings);
  // Memories show whenever any exist, even with Jarso off: the child can always forget them.
  const [nickname, guide, memories, tour] = await Promise.all([
    getChildNickname(),
    getGuideState(user.id),
    getMemories(user.id),
    fallback(getTour(user.id), { buddy: null, finishedAt: null }, "Tour on Me"),
  ]);
  const showMemories = guide.available || memories.length > 0;
  return (
    // Two columns from 1024 px: who you are and how Jarso looks and sounds on the left, what
    // Jarso remembers and signing out on the right, so the page fits one screen.
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <div className="grid gap-6">
        <Card className="rise-in">
          <CardContent>
            <section aria-labelledby="me-you" className="flex items-center gap-4">
              <span
                aria-hidden
                className={cn(
                  "grid size-14 shrink-0 place-items-center overflow-hidden rounded-full font-extrabold text-h2",
                  toneIcon.teal,
                )}
              >
                {/* The buddy they picked on the welcome tour (2026-11-06), else their initial. */}
                {tour.buddy ? (
                  <CoachHead coach={tour.buddy} size={56} />
                ) : nickname ? (
                  nickname.charAt(0).toUpperCase()
                ) : (
                  <UserRoundIcon className="size-7" />
                )}
              </span>
              <div className="grid gap-1">
                <h2 id="me-you" className="text-h3">
                  You
                </h2>
                <p className="text-ink-2">
                  {nickname ? `You sign in as ${nickname}.` : "Your nickname is how you sign in."} A
                  parent can change your nickname or PIN.
                </p>
                <div className="pt-2">
                  <ReplayTourButton />
                </div>
              </div>
            </section>
          </CardContent>
        </Card>
        <Card className="rise-in" style={rise(1)}>
          <CardContent>
            <section aria-labelledby="me-looks" className="grid gap-4">
              <div className="grid gap-1">
                <h2 id="me-looks" className="flex items-center gap-2 text-h3">
                  <PaletteIcon aria-hidden className="size-5" />
                  Looks &amp; sounds
                </h2>
                <p className="text-ink-2 text-sm">Light, dark, or follow your device.</p>
              </div>
              <ThemeChoice />
              <SoundsToggle />
              <PushToggle />
            </section>
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-6">
        {showMemories ? (
          <div className="rise-in" style={rise(2)}>
            <MemoryList memories={memories} whose="you" />
          </div>
        ) : null}
        <Card className="rise-in" style={rise(3)}>
          <CardContent>
            <section aria-labelledby="me-done" className="grid gap-4">
              <div className="grid gap-1">
                <h2 id="me-done" className="flex items-center gap-2 text-h3">
                  <LogOutIcon aria-hidden className="size-5" />
                  Done for now?
                </h2>
                <p className="text-ink-2 text-sm">
                  You can sign back in with your family code, nickname and PIN.
                </p>
              </div>
              <CoachSays coach={{ key: "settings" }} says={{ moment: "doneForNow" }} size="sm" />
              <SignOutButton />
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function ChildSettingsPage() {
  return (
    <PageContainer>
      <PageHeader title="Me" />
      <Suspense
        fallback={
          <SlowFallback>
            <PageSkeleton />
          </SlowFallback>
        }
      >
        <ChildSettings />
      </Suspense>
    </PageContainer>
  );
}
