import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";
import { SlowFallback } from "@/components/shell";
import { routes } from "@/config";
import { getFamily, requireRole } from "@/features/family/server";
import {
  guideCopy,
  JarsoChatPage,
  JarsoPageThread,
  MAX_TURNS,
  threadMessagesFrom,
} from "@/features/guide";
import { getGuideState, getMyTranscript, listMyChats } from "@/features/guide/server";

export const metadata: Metadata = { title: "Jarso" };

type Props = PageProps<"/child/jarso">;

const paramsSchema = z.object({ chat: z.uuid().optional() });
const hrefFor = (id: string) => `${routes.childJarso}?chat=${id}` as Route;

/**
 * The child's Jarso page (FR07): every chat they have had down the side, the open one in the
 * middle. A chat they pick up again keeps its turns; a full one offers a new chat.
 */
async function JarsoContent({ searchParams }: Pick<Props, "searchParams">) {
  const { user } = await requireRole("child", routes.childJarso);
  const { chat } = paramsSchema.parse(await searchParams);
  const [state, family] = await Promise.all([getGuideState(user.id), getFamily()]);
  if (!state.available) {
    return (
      <p className="rounded-xl bg-muted p-4 text-ink-2">
        {guideCopy.switchedOff}{" "}
        <Link
          href={routes.child}
          className="font-semibold text-primary underline-offset-4 hover:underline"
        >
          Back to Home
        </Link>
      </p>
    );
  }
  const currency = family?.currency ?? "USD";
  const [chats, transcript] = await Promise.all([
    listMyChats(),
    chat ? getMyTranscript(chat) : null,
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
      hrefFor={hrefFor}
      newHref={routes.childJarso}
      timezone={family?.timezone ?? "UTC"}
    >
      <JarsoPageThread
        key={transcript?.summary.id ?? "new"}
        introNeeded={state.introNeeded}
        suggestions={[
          suggestions.jars,
          suggestions.spent,
          suggestions.saving,
          suggestions.learning,
        ]}
        reopened={reopened}
        chatHref={routes.childJarso}
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
