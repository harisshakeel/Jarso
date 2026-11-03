"use client";

import type { ThreadMessage } from "@jarso/core/guide";
import { guideCopy, guideUi, MAX_MESSAGE_LENGTH, sendGuideTurn } from "@jarso/core/guide";
import { BotIcon, ExternalLinkIcon, SendHorizontalIcon, SparklesIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { Button } from "@/components/ui";
import { newId, runOnline } from "@/features/offline";
import { cn } from "@/lib";
import { GuideBubble } from "./guide-reply";
import { ThinkingBubble } from "./thinking-bubble";

/** The server's turn deadline is 45 s; this leaves room for its reply or its slow notice. */
const TURN_TIMEOUT_MS = 52_000;

export type Kid = { id: string; nickname: string };

/** A stored chat to pick up again: its id, how many turns are left, and its messages so far. */
export type ReopenedChat = {
  conversationId: string;
  turnsLeft: number;
  messages: ThreadMessage[];
  /** For a parent's chat: the child it is about (fixed for the rest of the chat). */
  kid?: Kid;
};

export type GuideThreadProps = {
  /** The intro card comes first for a child who has never chatted. */
  introNeeded?: boolean;
  /** Questions to start with, from what the child has (no allowance, no allowance question). */
  suggestions?: string[];
  /** A parent asks about one of their children; the child asks about themselves. */
  audience?: "child" | "parent";
  /** The parent's children Jarso is on for; the first is picked to start. */
  kids?: Kid[];
  /** A chat being continued (the Jarso page). */
  reopened?: ReopenedChat;
  /** The full-page chat, for the "Open" link beside the title of the Home window. */
  openHref?: Route;
  /** The window on Home keeps its card look; the page fills the height. */
  variant?: "card" | "page";
  /** The page's way to refresh its list of chats once a new chat has its first reply. */
  onChatStarted?: (conversationId: string) => void;
};

/**
 * One chat with Jarso (FR07, ADR 0011): the title, the AI disclosure, the messages, the status
 * bubble while Jarso works, and the composer. Jarso answers from the child's own jars,
 * allowance, history and learning, looked up only when asked, and the reply appears once it
 * has passed the output screen. Shared by the Ask Jarso window on Home and the Jarso page.
 */
export function GuideThread({
  introNeeded = false,
  suggestions = [],
  audience = "child",
  kids = [],
  reopened,
  openHref,
  variant = "card",
  onChatStarted,
}: GuideThreadProps) {
  const [introSeen, setIntroSeen] = useState(!introNeeded);
  const [kidId, setKidId] = useState(reopened?.kid?.id ?? kids[0]?.id ?? null);
  const kid = reopened?.kid ?? kids.find((k) => k.id === kidId) ?? kids[0] ?? null;
  const forParent = audience === "parent" && kid !== null;
  const copy = forParent
    ? {
        title: guideCopy.parent.title(kid.nickname),
        disclosure: guideCopy.parent.disclosure(kid.nickname),
        placeholder: guideCopy.parent.placeholder(kid.nickname),
        suggestions: guideCopy.parent.suggestions(kid.nickname),
      }
    : {
        title: guideCopy.homeTitle,
        disclosure: guideCopy.disclosure,
        placeholder: guideCopy.homePlaceholder,
        suggestions,
      };
  const [conversationId, setConversationId] = useState<string | null>(
    reopened?.conversationId ?? null,
  );
  const [messages, setMessages] = useState<ThreadMessage[]>(reopened?.messages ?? []);
  const [turnsLeft, setTurnsLeft] = useState<number | null>(reopened?.turnsLeft ?? null);
  const [text, setText] = useState("");
  // The question on its way: shown as sent while Jarso works, put back in the box if it fails.
  const [sending, setSending] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [full, setFull] = useState(reopened ? reopened.turnsLeft === 0 : false);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLTextAreaElement>(null);
  const listEnd = useRef<HTMLDivElement>(null);
  // Bumped on every new chat, so a reply that lands after it is dropped.
  const generation = useRef(0);
  // Sending the same text again after a failure reuses its id, so a reply that was saved but
  // lost on the way back is shown, not asked again.
  const unanswered = useRef<{ text: string; id: string } | null>(null);
  const page = variant === "page";

  // Keep the newest message and the status line in view.
  useEffect(() => {
    if (messages.length > 0 || pending) listEnd.current?.scrollIntoView({ block: "nearest" });
  }, [messages, pending]);

  function newChat() {
    generation.current += 1;
    setConversationId(null);
    setMessages([]);
    setTurnsLeft(null);
    setText("");
    setSending(null);
    setError(null);
    setFull(false);
    unanswered.current = null;
    input.current?.focus();
  }

  function ask(question: string) {
    if (!question || pending) return;
    setError(null);
    setStatus(null);
    if (unanswered.current?.text !== question) {
      // Minted on submit, never in render, so server and client HTML match.
      unanswered.current = { text: question, id: newId() };
    }
    const clientMessageId = unanswered.current.id;
    const started = generation.current;
    const firstTurn = conversationId === null;
    setSending(question);
    setText("");
    startTransition(async () => {
      const result = await runOnline(
        () =>
          sendGuideTurn(
            {
              clientMessageId,
              conversationId,
              context: forParent ? { entry: "parent", childId: kid.id } : { entry: "home" },
              text: question,
            },
            (line) => {
              if (started === generation.current) setStatus(line);
            },
          ),
        { timeoutMs: TURN_TIMEOUT_MS },
      );
      if (started !== generation.current) return;
      // After an await, updates leave the transition unless wrapped again (see rule-row.tsx).
      startTransition(() => {
        setStatus(null);
        setSending(null);
        if (!result.ok) {
          setText(question);
          if (result.error.code === "CONFLICT") setFull(true);
          setError({
            code: result.error.code,
            message:
              result.error.code === "VALIDATION"
                ? (result.error.fieldErrors?.text?.[0] ?? result.error.message)
                : result.error.code === "INTERNAL"
                  ? guideCopy.routes.unavailable
                  : result.error.message,
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
        if (firstTurn) onChatStarted?.(result.data.conversationId);
      });
    });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    ask(text.trim());
  }

  const composer = full ? (
    <div className="grid gap-2">
      <p className="text-ink-2">{guideCopy.chatFull}</p>
      <Button variant="outline" onClick={newChat} className="w-fit">
        {guideCopy.newChat}
      </Button>
    </div>
  ) : (
    <form onSubmit={submit} className="grid gap-2">
      <label htmlFor="ask-jarso-question" className="sr-only">
        {guideUi.questionLabel}
      </label>
      <textarea
        id="ask-jarso-question"
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
        placeholder={copy.placeholder}
        className="w-full resize-none rounded-xl border border-hairline-strong bg-card px-3 py-2 outline-none focus-visible:border-primary"
        aria-describedby="ask-jarso-count"
      />
      <div className="flex items-center justify-between gap-3">
        <span id="ask-jarso-count" className="text-ink-2 text-sm">
          {guideUi.count(text.length, MAX_MESSAGE_LENGTH)}
          {turnsLeft !== null && turnsLeft <= 3 ? guideUi.turnsLeft(turnsLeft) : ""}
        </span>
        <div className="flex items-center gap-2">
          {messages.length > 0 && !pending && !page ? (
            <Button type="button" variant="ghost" onClick={newChat}>
              {guideUi.newChat}
            </Button>
          ) : null}
          {/* Not a keycap: Home keeps its one keycap for the next step. */}
          <Button type="submit" size="lg" loading={pending} disabled={!text.trim()}>
            <SendHorizontalIcon aria-hidden />
            {guideUi.ask}
          </Button>
        </div>
      </div>
    </form>
  );

  return (
    <section
      aria-labelledby="ask-jarso"
      className={cn("gap-4", page ? "flex min-h-full flex-col" : "grid")}
    >
      <div className="grid gap-1">
        <div className="flex items-center justify-between gap-3">
          <h2 id="ask-jarso" className="flex items-center gap-2 text-h3">
            <SparklesIcon aria-hidden className="size-5 text-accent-text" />
            {copy.title}
          </h2>
          {openHref ? (
            <Link
              href={openHref}
              className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 font-semibold text-primary text-sm underline-offset-4 hover:underline"
            >
              {guideUi.open}
              <ExternalLinkIcon aria-hidden className="size-4" />
            </Link>
          ) : null}
        </div>
        <p className="text-ink-2 text-sm">{copy.disclosure}</p>
      </div>
      {forParent && kids.length > 1 && !reopened ? (
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="sr-only">{guideCopy.parent.pick}</legend>
          <span className="text-ink-2 text-sm">{guideCopy.parent.pick}</span>
          {kids.map((k) => (
            <Button
              key={k.id}
              type="button"
              variant={k.id === kid.id ? "secondary" : "outline"}
              aria-pressed={k.id === kid.id}
              disabled={pending}
              onClick={() => {
                if (k.id === kid.id) return;
                setKidId(k.id);
                newChat();
              }}
            >
              {k.nickname}
            </Button>
          ))}
        </fieldset>
      ) : null}

      {!introSeen ? (
        <div className="grid gap-3 self-start rounded-2xl bg-secondary p-5">
          <p className="flex items-center gap-2 font-bold">
            <BotIcon aria-hidden className="size-5" />
            {guideUi.beforeWeStart}
          </p>
          {guideCopy.intro.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <Button
            size="lg"
            className="w-fit"
            onClick={() => {
              setIntroSeen(true);
              requestAnimationFrame(() => input.current?.focus());
            }}
          >
            {guideCopy.introButton}
          </Button>
        </div>
      ) : (
        <>
          <div className={cn("grid content-start gap-3", page && "min-h-0 flex-1 overflow-y-auto")}>
            {messages.length > 0 || sending ? (
              <ol aria-label={guideUi.chatLabel} aria-live="polite" className="grid gap-3">
                {messages.map((message) =>
                  message.from === "child" ? (
                    <SentBubble key={message.id} text={message.text} />
                  ) : (
                    <li key={message.id}>
                      <GuideBubble reply={message.reply} />
                    </li>
                  ),
                )}
                {sending ? <SentBubble text={sending} /> : null}
              </ol>
            ) : null}
            {pending ? <ThinkingBubble status={status} /> : null}
            {messages.length === 0 && !pending && !sending ? (
              <ul aria-label={guideUi.tryThese} className="flex flex-wrap gap-2">
                {copy.suggestions.map((suggestion) => (
                  <li key={suggestion}>
                    <Button
                      variant="outline"
                      className="min-h-11"
                      onClick={() => {
                        setText(suggestion);
                        ask(suggestion);
                      }}
                    >
                      {suggestion}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div ref={listEnd} />
          </div>

          <div className={cn("grid gap-3", page && "sticky bottom-0 bg-background pt-2 pb-1")}>
            <FormError error={error ?? undefined} />
            {composer}
          </div>
        </>
      )}
    </section>
  );
}

/** A question the person asked, on the right in their colour. */
function SentBubble({ text }: { text: string }) {
  return (
    <li className="ml-8 justify-self-end whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-4 py-3 text-primary-foreground">
      <span className="sr-only">{guideUi.you}</span>
      {text}
    </li>
  );
}
