"use client";

import {
  BotIcon,
  CircleCheckIcon,
  PhoneIcon,
  SendHorizontalIcon,
  SparklesIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "lucide-react";
import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState, useTransition } from "react";
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui";
import { routes } from "@/config";
import { runOnline } from "@/features/offline";
import { cn } from "@/lib";
import { guideCopy } from "../copy";
import { type GuideContextRef, MAX_MESSAGE_LENGTH } from "../schemas";
import { askGuideAction, rateGuideMessageAction } from "../server/actions";
import type { AskGuideResult, GuideCheck, GuideReply } from "../types";

type Message =
  | { id: string; from: "child"; text: string }
  | { id: string; from: "guide"; reply: GuideReply };

type GuideSheetProps = {
  context: GuideContextRef;
  /** The child has never chatted: show the intro card before the first message. */
  introNeeded: boolean;
  triggerLabel: string;
  triggerVariant?: "outline" | "secondary";
  /** For "Help me" and "Why?" beside a step, a quieter trigger. */
  compact?: boolean;
};

/**
 * Client wait for one guide turn: the server's own turn deadline is 45 s, plus headroom so its
 * reply (or its slow notice) arrives first. Stays under the pages' maxDuration of 60 s.
 */
const TURN_TIMEOUT_MS = 52_000;

/**
 * The intro card shows before a child's first-ever message. Once they've read it on this page,
 * other guide buttons (a new step's "Help me") don't show it again.
 */
let introAcknowledged = false;

/**
 * The AI money guide (FR07) in a bottom sheet. Every open starts a fresh chat about the context
 * it was opened from. The "AI guide" label and the note that parents can see chats are always
 * shown (spec §5.5); the intro card comes first for a child who has never chatted.
 */
export function GuideSheet({
  context,
  introNeeded,
  triggerLabel,
  triggerVariant = "outline",
  compact,
}: GuideSheetProps) {
  const [open, setOpen] = useState(false);
  const [introSeen, setIntroSeen] = useState(!introNeeded || introAcknowledged);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [turnsLeft, setTurnsLeft] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<{ text: string; calm: boolean } | null>(null);
  const [full, setFull] = useState(false);
  const [pending, startTransition] = useTransition();
  const listEnd = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  // Bumped on every reset, so a reply that lands after the chat was closed is dropped.
  const generation = useRef(0);
  // The question being sent and its id. Sending the same text again after a failure reuses the
  // id, so a reply that was saved but lost on the way back is shown, not asked again.
  const unanswered = useRef<{ text: string; id: string } | null>(null);

  // "Got it" and "Start a new chat" disappear when pressed: move focus to the question box.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the dependencies are the triggers
  useEffect(() => {
    if (open && introSeen && !full) input.current?.focus();
  }, [introSeen, full]);

  // Keep the newest message in view: re-run when a message arrives or "Thinking…" shows.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the dependencies are the triggers
  useEffect(() => {
    listEnd.current?.scrollIntoView({ block: "end" });
  }, [messages, pending]);

  function reset() {
    generation.current += 1;
    setConversationId(null);
    setMessages([]);
    setTurnsLeft(null);
    setText("");
    setError(null);
    setFull(false);
    unanswered.current = null;
  }

  function send(event: FormEvent) {
    event.preventDefault();
    const question = text.trim();
    if (!question || pending) return;
    setError(null);
    if (unanswered.current?.text !== question) {
      unanswered.current = { text: question, id: crypto.randomUUID() };
    }
    const clientMessageId = unanswered.current.id;
    const started = generation.current;
    startTransition(async () => {
      const result = await runOnline<AskGuideResult>(
        () => askGuideAction(null, { clientMessageId, conversationId, context, text: question }),
        { timeoutMs: TURN_TIMEOUT_MS },
      );
      if (started !== generation.current) return;
      if (!result.ok) {
        if (result.error.code === "CONFLICT") setFull(true);
        setError({
          text:
            result.error.code === "VALIDATION"
              ? (result.error.fieldErrors?.text?.[0] ?? result.error.message)
              : result.error.code === "INTERNAL"
                ? guideCopy.routes.unavailable
                : result.error.message,
          calm: result.error.code === "UNAVAILABLE",
        });
        return;
      }
      unanswered.current = null;
      const { reply } = result.data;
      setConversationId(result.data.conversationId);
      setTurnsLeft(result.data.turnsLeft);
      if (result.data.turnsLeft === 0) setFull(true);
      setMessages((current) => [
        ...current,
        { id: `child-${current.length}`, from: "child", text: question },
        { id: reply.messageId ?? `guide-${current.length}`, from: "guide", reply },
      ]);
      setText("");
      input.current?.focus();
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset();
      }}
    >
      <SheetTrigger render={<Button variant={triggerVariant} size={compact ? "default" : "lg"} />}>
        <SparklesIcon aria-hidden />
        {triggerLabel}
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[90dvh] sm:mx-auto sm:w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BotIcon aria-hidden className="size-5" />
            Money guide
          </SheetTitle>
          <SheetDescription>{guideCopy.disclosure}</SheetDescription>
        </SheetHeader>

        <div className="grid min-h-0 gap-4 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6">
          {!introSeen ? (
            <section
              aria-labelledby="guide-intro"
              className="grid gap-3 rounded-2xl bg-secondary p-5"
            >
              <h2 id="guide-intro" className="flex items-center gap-2 font-bold text-h3">
                <BotIcon aria-hidden className="size-6" />
                Before we start
              </h2>
              {guideCopy.intro.map((line) => (
                <p key={line}>{line}</p>
              ))}
              <Button
                variant="keycap"
                size="lg"
                className="w-fit"
                onClick={() => {
                  introAcknowledged = true;
                  setIntroSeen(true);
                }}
              >
                {guideCopy.introButton}
              </Button>
            </section>
          ) : (
            <>
              <ol aria-label="Chat" aria-live="polite" className="grid gap-3">
                {messages.map((message) =>
                  message.from === "child" ? (
                    <li
                      key={message.id}
                      className="ml-8 justify-self-end rounded-2xl rounded-br-sm bg-primary px-4 py-3 text-primary-foreground"
                    >
                      <span className="sr-only">You: </span>
                      {message.text}
                    </li>
                  ) : (
                    <li key={message.id}>
                      <GuideBubble reply={message.reply} />
                    </li>
                  ),
                )}
                {pending ? (
                  <li className="w-fit rounded-2xl bg-muted px-4 py-3 text-ink-2">
                    {guideCopy.thinking}
                  </li>
                ) : null}
              </ol>
              <div ref={listEnd} />

              {error ? (
                <p
                  role={error.calm ? "status" : "alert"}
                  className={cn("font-semibold", error.calm ? "text-ink-2" : "text-destructive")}
                >
                  {error.text}
                </p>
              ) : null}

              {full ? (
                <div className="grid gap-2">
                  <p className="text-ink-2">{guideCopy.chatFull}</p>
                  <Button variant="outline" onClick={reset} className="w-fit">
                    {guideCopy.newChat}
                  </Button>
                </div>
              ) : (
                <form onSubmit={send} className="grid gap-2">
                  <label htmlFor="guide-question" className="sr-only">
                    Your question
                  </label>
                  <textarea
                    id="guide-question"
                    ref={input}
                    value={text}
                    onChange={(event) => setText(event.target.value.slice(0, MAX_MESSAGE_LENGTH))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    rows={2}
                    maxLength={MAX_MESSAGE_LENGTH}
                    placeholder={guideCopy.placeholder}
                    className="w-full resize-none rounded-xl border border-hairline-strong bg-card px-3 py-2 outline-none focus-visible:border-primary"
                    aria-describedby="guide-count"
                  />
                  <div className="flex items-center justify-between gap-3">
                    <span id="guide-count" className="text-ink-2 text-sm">
                      {text.length}/{MAX_MESSAGE_LENGTH}
                      {turnsLeft !== null && turnsLeft <= 3
                        ? ` · ${turnsLeft} left in this chat`
                        : ""}
                    </span>
                    <Button
                      type="submit"
                      variant="keycap"
                      loading={pending}
                      disabled={!text.trim()}
                    >
                      <SendHorizontalIcon aria-hidden />
                      Send
                    </Button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function GuideBubble({ reply }: { reply: GuideReply }) {
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
