import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { routes } from "@/config";
import { parentPageCopy } from "@/features/dashboard";
import { Transcript } from "@/features/guide";
import { getGuideTranscript } from "@/features/guide/server";
import { loadChild } from "../../load-child";
import { FormSkeleton, PageShell } from "../../page-shell";

export const metadata: Metadata = { title: "Jarso chat" };

async function ChatContent({
  params,
}: {
  params: Promise<{ childId: string; conversationId: string }>;
}) {
  const { childId, conversationId } = await params;
  const { child, timezone } = await loadChild(
    childId,
    routes.parentChildGuideChat(childId, conversationId),
  );
  const chat = await getGuideTranscript(childId, conversationId);
  if (!chat) notFound();
  return (
    <PageShell
      title={chat.summary.label}
      intro={chat.summary.flagged ? parentPageCopy.chatFlaggedIntro : undefined}
      back={{
        href: routes.parentChildGuide(childId),
        label: parentPageCopy.chatsBack(child.nickname),
      }}
    >
      <Transcript messages={chat.messages} timezone={timezone} nickname={child.nickname} />
    </PageShell>
  );
}

export default function GuideChatPage({
  params,
}: PageProps<"/parent/children/[childId]/guide/[conversationId]">) {
  return (
    <Suspense
      fallback={
        <PageShell title="Jarso chat">
          <FormSkeleton />
        </PageShell>
      }
    >
      <ChatContent params={params} />
    </Suspense>
  );
}
