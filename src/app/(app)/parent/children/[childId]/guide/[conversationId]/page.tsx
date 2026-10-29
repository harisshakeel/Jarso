import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { routes } from "@/config";
import { Transcript } from "@/features/guide";
import { getGuideTranscript } from "@/features/guide/server";
import { loadChild } from "../../load-child";
import { FormSkeleton, PageShell } from "../../page-shell";

export const metadata: Metadata = { title: "Guide chat" };

async function ChatContent({
  params,
}: {
  params: Promise<{ childId: string; conversationId: string }>;
}) {
  const { childId, conversationId } = await params;
  const { child } = await loadChild(childId, routes.parentChildGuideChat(childId, conversationId));
  const chat = await getGuideTranscript(childId, conversationId);
  if (!chat) notFound();
  return (
    <PageShell
      title={chat.summary.label}
      intro={
        chat.summary.flagged
          ? "This chat had a safety or rule response. A message that got a safety response stays private: talking to your child kindly is the best next step."
          : undefined
      }
      back={{ href: routes.parentChildGuide(childId), label: `${child.nickname}'s chats` }}
    >
      <Transcript messages={chat.messages} />
    </PageShell>
  );
}

export default function GuideChatPage({
  params,
}: PageProps<"/parent/children/[childId]/guide/[conversationId]">) {
  return (
    <Suspense
      fallback={
        <PageShell title="Guide chat">
          <FormSkeleton />
        </PageShell>
      }
    >
      <ChatContent params={params} />
    </Suspense>
  );
}
