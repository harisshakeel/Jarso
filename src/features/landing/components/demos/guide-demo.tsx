"use client";

import { BotIcon, LoaderCircleIcon, ScanSearchIcon } from "lucide-react";
import { useTimeline } from "../../hooks/use-timeline";
import { easeOut, segment, typed } from "../../motion";
import { DemoCard, DemoStage } from "./demo-parts";

const QUESTION = "My bike costs £120. How long will it take?";
const STATUS = "Working out a saving plan…";
const ANSWER =
  "You have £64 in Save, so £56 to go. Saving £8 from each allowance, that's about 7 more allowances.";

/**
 * Spec §3.3, ADR 0011: Ask Jarso. The child's question types in, Jarso says what it is looking
 * up, then the reply with the child's own figures.
 */
export function GuideDemo({ play }: { play: boolean }) {
  const t = useTimeline(play, 3000);
  // The question types in by about 1.5 s; the look-up line, then the reply.
  const question = typed(QUESTION, t, 200, 30);
  const thinking = t >= 1500 && t < 2300;
  const reply = easeOut(segment(t, 2300, 2600));

  return (
    <DemoStage label="Jarso looks up a child's own Save jar and answers how long their saving will take, with a topic to read next.">
      <DemoCard className="grid gap-4">
        <div className="grid gap-0.5">
          <p className="flex items-center gap-2 font-bold text-h3">
            <BotIcon aria-hidden className="size-5" />
            Ask Jarso
          </p>
          <p className="text-ink-2 text-sm">Jarso is an AI. Your parent can see these chats.</p>
        </div>
        <div className="grid min-h-60 content-start gap-3">
          {question ? (
            <p className="ml-8 justify-self-end rounded-2xl rounded-br-sm bg-primary px-4 py-3 text-primary-foreground">
              {question}
            </p>
          ) : null}
          {thinking ? (
            <p className="flex w-fit items-center gap-2 rounded-2xl bg-muted px-4 py-3 text-ink-2">
              <LoaderCircleIcon aria-hidden className="size-4 motion-safe:animate-spin" />
              {STATUS}
            </p>
          ) : null}
          {reply > 0 ? (
            <div
              style={{ opacity: reply, translate: `0 ${(1 - reply) * 10}px` }}
              className="mr-8 grid gap-3 rounded-2xl rounded-bl-sm bg-card p-4 shadow-rest"
            >
              <span className="flex w-fit items-center gap-1 rounded-full bg-cyan-100 px-2 py-0.5 font-semibold text-cyan-700 text-xs dark:bg-cyan-900 dark:text-cyan-300">
                <BotIcon aria-hidden className="size-3.5" />
                Jarso AI
              </span>
              <p>{ANSWER}</p>
              <p className="flex items-center gap-1.5 text-ink-2 text-sm">
                <ScanSearchIcon aria-hidden className="size-4 shrink-0" />
                Looked at: saving plan
              </p>
              <span className="inline-flex min-h-9 w-fit items-center rounded-full border border-hairline-strong px-4 font-semibold text-sm">
                Saving toward a goal
              </span>
            </div>
          ) : null}
        </div>
      </DemoCard>
    </DemoStage>
  );
}
