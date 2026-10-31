"use client";

import { BotIcon, LoaderCircleIcon, SendHorizontalIcon, SparklesIcon } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { Button, Card, CardContent } from "@/components/ui";
import { newId, runOnline } from "@/features/offline";
import { guideCopy } from "../copy";
import { MAX_MESSAGE_LENGTH } from "../schemas";
import { sendGuideTurn } from "../send-turn";
import type { GuideReply } from "../types";
import { GuideBubble } from "./guide-reply";

type Message =
  | { id: string; from: "child"; text: string }
  | { id: string; from: "guide"; reply: GuideReply };

/** The server's turn deadline is 45 s; this leaves room for its reply or its slow notice. */
const TURN_TIMEOUT_MS = 52_000;

/**
 * "Ask Jarso" (FR07, ADR 0011): the prompt window at the top of the child's Home. Jarso answers
 * from the child's own jars, allowance, history and learning, looked up only when asked; a
 * status line names each look-up while it works, and the reply appears once it has passed the
 * output screen. The AI label and the note that parents can see chats are always shown; the
 * intro card comes first for a child who has never chatted.
 */
export function AskJarso({
  introNeeded,
  suggestions,
}: {
  introNeeded: boolean;
  /** Questions to start with, from what the child has (no allowance, no allowance question). */
  suggestions: string[];
}) {
  const [introSeen, setIntroSeen] = useState(!introNeeded);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [turnsLeft, setTurnsLeft] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [full, setFull] = useState(false);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLTextAreaElement>(null);
  const listEnd = useRef<HTMLDivElement>(null);
  // Bumped on every new chat, so a reply that lands after it is dropped.
  const generation = useRef(0);
  // Sending the same text again after a failure reuses its id, so a reply that was saved but
  // lost on the way back is shown, not asked again.
  const unanswered = useRef<{ text: string; id: string } | null>(null);

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
    startTransition(async () => {
      const result = await runOnline(
        () =>
          sendGuideTurn(
            { clientMessageId, conversationId, context: { entry: "home" }, text: question },
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
        if (!result.ok) {
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
        setText("");
      });
    });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    ask(text.trim());
  }

  return (
    <Card className="rise-in border-accent-text/30">
      <CardContent>
        <section aria-labelledby="ask-jarso" className="grid gap-4">
          <div className="grid gap-1">
            <h2 id="ask-jarso" className="flex items-center gap-2 text-h3">
              <SparklesIcon aria-hidden className="size-5 text-accent-text" />
              {guideCopy.homeTitle}
            </h2>
            <p className="text-ink-2 text-sm">{guideCopy.disclosure}</p>
          </div>

          {!introSeen ? (
            <div className="grid gap-3 rounded-2xl bg-secondary p-5">
              <p className="flex items-center gap-2 font-bold">
                <BotIcon aria-hidden className="size-5" />
                Before we start
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
              {messages.length > 0 ? (
                <ol aria-label="Chat with Jarso" aria-live="polite" className="grid gap-3">
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
                </ol>
              ) : null}

              {pending ? (
                <p
                  role="status"
                  className="flex w-fit items-center gap-2 rounded-2xl bg-muted px-4 py-3 text-ink-2"
                >
                  <LoaderCircleIcon aria-hidden className="size-4 motion-safe:animate-spin" />
                  {status ?? guideCopy.thinking}
                </p>
              ) : null}
              <div ref={listEnd} />

              <FormError error={error ?? undefined} />

              {full ? (
                <div className="grid gap-2">
                  <p className="text-ink-2">{guideCopy.chatFull}</p>
                  <Button variant="outline" onClick={newChat} className="w-fit">
                    {guideCopy.newChat}
                  </Button>
                </div>
              ) : (
                <form onSubmit={submit} className="grid gap-2">
                  <label htmlFor="ask-jarso-question" className="sr-only">
                    Your question for Jarso
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
                    placeholder={guideCopy.homePlaceholder}
                    className="w-full resize-none rounded-xl border border-hairline-strong bg-card px-3 py-2 outline-none focus-visible:border-primary"
                    aria-describedby="ask-jarso-count"
                  />
                  <div className="flex items-center justify-between gap-3">
                    <span id="ask-jarso-count" className="text-ink-2 text-sm">
                      {text.length}/{MAX_MESSAGE_LENGTH}
                      {turnsLeft !== null && turnsLeft <= 3
                        ? ` · ${turnsLeft} left in this chat`
                        : ""}
                    </span>
                    <div className="flex items-center gap-2">
                      {messages.length > 0 && !pending ? (
                        <Button type="button" variant="ghost" onClick={newChat}>
                          New chat
                        </Button>
                      ) : null}
                      {/* Not a keycap: Home keeps its one keycap for the next step. */}
                      <Button type="submit" size="lg" loading={pending} disabled={!text.trim()}>
                        <SendHorizontalIcon aria-hidden />
                        Ask
                      </Button>
                    </div>
                  </div>
                </form>
              )}

              {messages.length === 0 && !pending ? (
                <ul aria-label="Questions to try" className="flex flex-wrap gap-2">
                  {suggestions.map((suggestion) => (
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
            </>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
