import { randomUUID } from "node:crypto";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";
import { SlowFallback } from "@/components/shell";
import { routes } from "@/config";
import { getChildNickname, getFamily, requireRole } from "@/features/family/server";
import {
  guideCopy,
  guideUi,
  JarsoChatPage,
  JarsoPageThread,
  MAX_TURNS,
  threadMessagesFrom,
} from "@/features/guide";
import { getGuideState, getMyTranscript, listMyChats } from "@/features/guide/server";
import { fallback } from "@/lib";

export const metadata: Metadata = { title: "Jarso" };

type Props = PageProps<"/child/jarso">;

const paramsSchema = z.object({ chat: z.uuid().optional(), new: z.string().max(16).optional() });

/**
 * The child's Jarso page (FR07): the chat filling the page, past chats behind "History". A chat
 * they pick up again keeps its turns; a full one offers a new chat.
 */
async function JarsoContent({ searchParams }: Pick<Props, "searchParams">) {
  const { user } = await requireRole("child", routes.childJarso);
  const { chat, new: nonce } = paramsSchema.parse(await searchParams);
  // A fresh nonce each render, so "New chat" starts over even from an unsaved new chat.
  const newHref = `${routes.childJarso}?new=${randomUUID().slice(0, 8)}` as Route;
  const [state, family] = await Promise.all([getGuideState(user.id), getFamily()]);
  if (!state.available) {
    return (
      <p className="rounded-xl bg-muted p-4 text-ink-2">
        {guideCopy.switchedOff}{" "}
        <Link
          href={routes.child}
          className="font-semibold text-primary underline-offset-4 hover:underline"
        >
          {guideUi.backToHome}
        </Link>
      </p>
    );
  }
  const currency = family?.currency ?? "USD";
  const [chats, transcript, nickname] = await Promise.all([
    listMyChats(),
    chat ? getMyTranscript(chat) : null,
    fallback(getChildNickname(), "", "The child's nickname on the Jarso page"),
  ]);
  const reopened = transcript
    ? {
        conversationId: transcript.summary.id,
        turnsLeft: Math.max(0, MAX_TURNS - transcript.summary.turns),
        messages: threadMessagesFrom(transcript.messages, currency),
      }
    : undefined;
  const { suggestions } = guideCopy;
  return (
    <JarsoChatPage
      chats={chats}
      currentId={transcript?.summary.id ?? null}
      chatHref={routes.childJarso}
      newHref={newHref}
      timezone={family?.timezone ?? "UTC"}
    >
      <JarsoPageThread
        introNeeded={state.introNeeded}
        suggestions={[
          suggestions.jars,
          suggestions.spent,
          suggestions.saving,
          suggestions.learning,
        ]}
        person={nickname}
        reopened={reopened}
        chatHref={routes.childJarso}
        chatId={chat ?? null}
        nonce={nonce ?? null}
      />
    </JarsoChatPage>
  );
}

export default function ChildJarsoPage({ searchParams }: Props) {
  return (
    <div className="grid w-full gap-5">
      <h1 className="sr-only">Jarso</h1>
      <Suspense
        fallback={
          <SlowFallback>
            <div aria-hidden className="shimmer h-96 rounded-xl bg-muted" />
          </SlowFallback>
        }
      >
        <JarsoContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
