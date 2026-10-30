"use client";

import {
  BotIcon,
  CircleCheckIcon,
  PhoneIcon,
  ScanSearchIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { routes } from "@/config";
import { runOnline } from "@/features/offline";
import { cn } from "@/lib";
import { guideCopy } from "../copy";
import { rateGuideMessageAction } from "../server/actions";
import type { GuideCheck, GuideReply } from "../types";

/** One reply from Jarso: the answer, what it looked at, helplines, topics, a check, thumbs. */
export function GuideBubble({ reply }: { reply: GuideReply }) {
  const [rating, setRating] = useState<1 | -1 | null>(null);
  const [, startRating] = useTransition();
  function rate(value: 1 | -1) {
    if (!reply.messageId) return;
    const messageId = reply.messageId;
    setRating(value);
    startRating(async () => {
      await runOnline(() => rateGuideMessageAction(null, { messageId, rating: value }));
    });
  }
  return (
    <div className="mr-8 grid gap-3 rounded-2xl rounded-bl-sm bg-card p-4 shadow-rest">
      <span className="flex w-fit items-center gap-1 rounded-full bg-cyan-100 px-2 py-0.5 font-semibold text-cyan-700 text-xs dark:bg-cyan-900 dark:text-cyan-300">
        <BotIcon aria-hidden className="size-3.5" />
        {guideCopy.label}
      </span>
      <p className="whitespace-pre-line">{reply.text}</p>
      {reply.lookedAt.length > 0 ? (
        <p className="flex items-center gap-1.5 text-ink-2 text-sm">
          <ScanSearchIcon aria-hidden className="size-4 shrink-0" />
          Looked at: {reply.lookedAt.join(", ")}
        </p>
      ) : null}
      {reply.helplines.length > 0 ? (
        <ul className="grid gap-2" aria-label="People you can talk to">
          {reply.helplines.map((line) => (
            <li key={line.name} className="grid gap-0.5 rounded-xl bg-secondary p-3">
              <a
                href={line.url}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-11 items-center gap-2 font-bold underline underline-offset-4"
              >
                <PhoneIcon aria-hidden className="size-4" />
                {line.name}
              </a>
              <span className="text-sm">{line.contact}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {reply.route === "safety" ? (
        <p className="font-semibold">{guideCopy.routes.safetyEmergency}</p>
      ) : null}
      {reply.topics.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Topics">
          {reply.topics.map((topic) => (
            <li key={topic.key}>
              <Link
                href={routes.childTopic(topic.key)}
                className="inline-flex min-h-11 items-center rounded-full border border-hairline-strong px-4 font-semibold text-sm hover:bg-muted"
              >
                {topic.title}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {reply.check ? <CheckQuestion check={reply.check} /> : null}
      {reply.role === "guide" && reply.messageId ? (
        <fieldset className="flex items-center gap-1">
          <legend className="sr-only">Was this helpful?</legend>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Helpful"
            aria-pressed={rating === 1}
            onClick={() => rate(1)}
            className={cn(rating === 1 && "bg-muted")}
          >
            <ThumbsUpIcon aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Not helpful"
            aria-pressed={rating === -1}
            onClick={() => rate(-1)}
            className={cn(rating === -1 && "bg-muted")}
          >
            <ThumbsDownIcon aria-hidden />
          </Button>
        </fieldset>
      ) : null}
    </div>
  );
}

/** The guide's optional one-question check (FR07). Answered in the browser; nothing is saved. */
function CheckQuestion({ check }: { check: GuideCheck }) {
  const [picked, setPicked] = useState<number | null>(null);
  const result = useRef<HTMLParagraphElement>(null);
  // The options lock once one is picked, so focus moves to the result.
  useEffect(() => {
    if (picked !== null) result.current?.focus();
  }, [picked]);
  return (
    <fieldset className="grid gap-2 rounded-xl border border-hairline p-3">
      <legend className="px-1 font-semibold">Quick check: {check.question}</legend>
      {check.options.map((option, index) => (
        <Button
          // Options are distinct (the pipeline drops a check with repeats).
          key={option}
          variant="outline"
          className={cn(
            "justify-start",
            picked !== null && index === check.answerIndex && "border-primary bg-secondary",
          )}
          aria-pressed={picked === index}
          disabled={picked !== null}
          onClick={() => setPicked(index)}
        >
          {option}
        </Button>
      ))}
      {picked !== null ? (
        <p ref={result} tabIndex={-1} role="status" className="flex items-start gap-2 outline-none">
          {picked === check.answerIndex ? (
            <CircleCheckIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
          ) : null}
          <span>
            {picked === check.answerIndex ? "That's it. " : "Not quite. "}
            {check.explanation}
          </span>
        </p>
      ) : null}
    </fieldset>
  );
}
