import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { routes } from "@/config";
import { ChatList, GuideSwitch, MemoryList } from "@/features/guide";
import { getGuideAccess, getMemories, listGuideChats } from "@/features/guide/server";
import { loadChild } from "../load-child";
import { FormSkeleton, PageShell } from "../page-shell";

export const metadata: Metadata = { title: "Jarso chats" };

async function GuideContent({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;
  const { child, timezone } = await loadChild(childId, routes.parentChildGuide(childId));
  const [access, chats, memories] = await Promise.all([
    getGuideAccess(childId),
    listGuideChats(childId),
    getMemories(childId),
  ]);
  if (!access.configured && chats.length === 0) notFound();
  return (
    <PageShell
      title={`${child.nickname}'s chats with Jarso`}
      intro="Every chat, newest first, with any that need a look at the top. Text is kept for 30 days."
      back={{ href: routes.parentChild(childId), label: child.nickname }}
    >
      {access.configured ? (
        <section className="rounded-xl bg-card p-5 shadow-rest">
          <GuideSwitch childId={childId} nickname={child.nickname} enabled={access.enabled} />
        </section>
      ) : null}
      {access.configured || memories.length > 0 ? (
        <MemoryList memories={memories} whose={child.nickname} />
      ) : null}
      <section aria-labelledby="chats-heading" className="grid gap-3">
        <h2 id="chats-heading" className="text-h3">
          Chats
        </h2>
        <ChatList
          chats={chats}
          timezone={timezone}
          hrefFor={(id) => routes.parentChildGuideChat(childId, id)}
        />
      </section>
    </PageShell>
  );
}

export default function GuideChatsPage({ params }: PageProps<"/parent/children/[childId]/guide">) {
  return (
    <Suspense
      fallback={
        <PageShell title="Jarso chats">
          <FormSkeleton />
        </PageShell>
      }
    >
      <GuideContent params={params} />
    </Suspense>
  );
}
