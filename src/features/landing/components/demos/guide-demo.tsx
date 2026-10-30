"use client";

import { BotIcon } from "lucide-react";
import { useTimeline } from "../../hooks/use-timeline";
import { easeOut, segment, typed } from "../../motion";
import { DemoCard, DemoStage } from "./demo-parts";

const QUESTION = "Why save before I spend?";
const ANSWER = "If you save first, the saving always happens. What's left is yours to spend.";

/** Spec §3.3: the guide sheet. The child's question types in, three dots, then the reply. */
export function GuideDemo({ play }: { play: boolean }) {
  const t = useTimeline(play, 2400);
  const question = typed(QUESTION, t, 200, 30);
  const thinking = t >= 1000 && t < 1800;
  const reply = easeOut(segment(t, 1800, 2100));

  return (
    <DemoStage label="The money guide answers a child's question with a short explanation and a topic to read next.">
      <DemoCard className="grid gap-4">
        <div className="grid gap-0.5">
          <p className="flex items-center gap-2 font-bold text-h3">
            <BotIcon aria-hidden className="size-5" />
            Money guide
          </p>
          <p className="text-ink-2 text-sm">AI guide. Your parent can see these chats.</p>
        </div>
        <div className="grid min-h-60 content-start gap-3">
          {question ? (
            <p className="ml-8 justify-self-end rounded-2xl rounded-br-sm bg-primary px-4 py-3 text-primary-foreground">
              {question}
            </p>
          ) : null}
          {thinking ? (
            <p className="flex w-fit gap-1 rounded-2xl bg-muted px-4 py-4">
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  style={{ animationDelay: `${dot * 150}ms` }}
                  className="size-2 animate-pulse rounded-full bg-ink-2"
                />
              ))}
            </p>
          ) : null}
          {reply > 0 ? (
            <div
              style={{ opacity: reply, translate: `0 ${(1 - reply) * 10}px` }}
              className="mr-8 grid gap-3 rounded-2xl rounded-bl-sm bg-card p-4 shadow-rest"
            >
              <span className="flex w-fit items-center gap-1 rounded-full bg-cyan-100 px-2 py-0.5 font-semibold text-cyan-700 text-xs dark:bg-cyan-900 dark:text-cyan-300">
                <BotIcon aria-hidden className="size-3.5" />
                AI guide
              </span>
              <p>{ANSWER}</p>
              <span className="inline-flex min-h-9 w-fit items-center rounded-full border border-hairline-strong px-4 font-semibold text-sm">
                Spend and Save
              </span>
            </div>
          ) : null}
        </div>
      </DemoCard>
    </DemoStage>
  );
}
