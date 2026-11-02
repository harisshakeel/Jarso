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
  threadMessagesFrom,
} from "@/features/guide";
import {
  getGuideAccess,
  getParentTranscript,
  isGuideConfigured,
  listParentChats,
} from "@/features/guide/server";
import { fallback } from "@/lib";

export const metadata: Metadata = { title: "Jarso" };

type Props = PageProps<"/parent/jarso">;

const paramsSchema = z.object({ chat: z.uuid().optional() });
const hrefFor = (id: string) => `${routes.parentJarso}?chat=${id}` as Route;

/**
 * The parent's Jarso page: their own chats about their children down the side, the open one in
 * the middle, with a chip per child Jarso is on for when starting a new chat.
 */
async function JarsoContent({ searchParams }: Pick<Props, "searchParams">) {
  const { membership } = await requireRole("parent", routes.parentJarso);
  if (!membership) redirect(routes.parentSetup);
  const { chat } = paramsSchema.parse(await searchParams);
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
  const [chats, transcript] = await Promise.all([
    listParentChats(),
    chat ? getParentTranscript(chat) : null,
  ]);
  const about = transcript ? children.find((c) => c.id === transcript.summary.childId) : null;
  const reopened =
    transcript && about
      ? {
          conversationId: transcript.summary.id,
          turnsLeft: Math.max(0, MAX_TURNS - transcript.summary.turns),
          messages: threadMessagesFrom(transcript.messages, currency),
          kid: about,
        }
      : undefined;
  return (
    <JarsoChatPage
      chats={chats}
      currentId={reopened?.conversationId ?? null}
      hrefFor={hrefFor}
      newHref={routes.parentJarso}
      timezone={family?.timezone ?? "UTC"}
      names={names}
    >
      {kids.length > 0 || reopened ? (
        <JarsoPageThread
          key={reopened?.conversationId ?? "new"}
          audience="parent"
          kids={kids}
          reopened={reopened}
          chatHref={routes.parentJarso}
        />
      ) : (
        <p className="rounded-xl bg-muted p-4 text-ink-2">
          Jarso is off for every child. Turn it on from a child's page to ask about them.{" "}
          <Link
            href={routes.parent}
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            Back to Home
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
