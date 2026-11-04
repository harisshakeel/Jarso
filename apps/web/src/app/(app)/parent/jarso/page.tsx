import { randomUUID } from "node:crypto";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { SlowFallback } from "@/components/shell";
import { routes } from "@/config";
import { getFamily, listChildren, requireRole } from "@/features/family/server";
import {
  guideCopy,
  JarsoChatPage,
  JarsoPageThread,
  MAX_TURNS,
  parentGuideCopy,
  threadMessagesFrom,
} from "@/features/guide";
import {
  getGuideAccess,
  getParentTranscript,
  isGuideConfigured,
  listParentChats,
} from "@/features/guide/server";
import { getProfile } from "@/features/profiles/server";
import { fallback } from "@/lib";

export const metadata: Metadata = { title: "Jarso" };

type Props = PageProps<"/parent/jarso">;

const paramsSchema = z.object({ chat: z.uuid().optional(), new: z.string().max(16).optional() });

/**
 * The parent's Jarso page: the chat filling the page, their past chats about their children
 * behind "History", with a chip per child Jarso is on for when starting a new chat.
 */
async function JarsoContent({ searchParams }: Pick<Props, "searchParams">) {
  const { user, membership } = await requireRole("parent", routes.parentJarso);
  if (!membership) redirect(routes.parentSetup);
  const { chat, new: nonce } = paramsSchema.parse(await searchParams);
  // A fresh nonce each render, so "New chat" starts over even from an unsaved new chat.
  const newHref = `${routes.parentJarso}?new=${randomUUID().slice(0, 8)}` as Route;
  if (!isGuideConfigured()) {
    return <p className="rounded-xl bg-muted p-4 text-ink-2">{guideCopy.switchedOff}</p>;
  }
  const [family, children] = await Promise.all([getFamily(), listChildren()]);
  const currency = family?.currency ?? "USD";
  const access = await Promise.all(
    children.map(async (child) => ({
      child,
      enabled: await fallback(
        getGuideAccess(child.id).then((a) => a.enabled),
        false,
        "Guide access on the parent's Jarso page",
      ),
    })),
  );
  const kids = access.filter((a) => a.enabled).map((a) => a.child);
  const names = Object.fromEntries(children.map((child) => [child.id, child.nickname]));
  const [chats, transcript, fullName] = await Promise.all([
    listParentChats(),
    chat ? getParentTranscript(chat) : null,
    fallback(
      getProfile(user.id).then((profile) => profile.fullName),
      null,
      "The parent's name on the Jarso page",
    ),
  ]);
  const firstName = fullName?.trim().split(/\s+/)[0] ?? "";
  const about = transcript ? children.find((c) => c.id === transcript.summary.childId) : null;
  const reopened =
    transcript && about
      ? {
          conversationId: transcript.summary.id,
          turnsLeft: Math.max(0, MAX_TURNS - transcript.summary.turns),
          messages: threadMessagesFrom(transcript.messages, currency, about.nickname),
          kid: about,
        }
      : undefined;
  return (
    <JarsoChatPage
      chats={chats}
      currentId={reopened?.conversationId ?? null}
      chatHref={routes.parentJarso}
      newHref={newHref}
      timezone={family?.timezone ?? "UTC"}
      names={names}
    >
      {kids.length > 0 || reopened ? (
        <JarsoPageThread
          audience="parent"
          kids={kids}
          person={firstName}
          reopened={reopened}
          chatHref={routes.parentJarso}
          chatId={chat ?? null}
          nonce={nonce ?? null}
        />
      ) : (
        <p className="rounded-xl bg-muted p-4 text-ink-2">
          {parentGuideCopy.offForEveryChild}{" "}
          <Link
            href={routes.parent}
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            {parentGuideCopy.backHome}
          </Link>
        </p>
      )}
    </JarsoChatPage>
  );
}

export default function ParentJarsoPage({ searchParams }: Props) {
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
