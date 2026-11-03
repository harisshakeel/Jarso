"use client";

import { Fragment, useEffect, useState } from "react";
import { motionAllowed } from "./motion";

/** About 25 words a second, and never longer than this for the whole reply. */
const WORD_MS = 40;
const MAX_MS = 2_000;

/** A money figure in a reply: a currency sign, then digits (with separators and decimals). */
const MONEY = /([£$€]\s?\d[\d,]*(?:\.\d+)?)/g;

/** The text with each money figure in a `money` span, so figures sit in tabular numerals. */
export function withMoney(text: string) {
  return text.split(MONEY).map((part, index) =>
    index % 2 === 1 ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: the parts are static once split
      <span key={index} className="money font-semibold">
        {part}
      </span>
    ) : (
      // biome-ignore lint/suspicious/noArrayIndexKey: the parts are static once split
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}

/**
 * A reply typed out word by word (design.md §8): the whole screened reply is in hand before the
 * first word shows, so this is a reveal, never a stream. While it types, assistive technology
 * reads the whole text; sighted readers see the words land in a typing rhythm, with a caret at
 * the end. Reduced motion, and a reopened chat, show the whole reply at once.
 */
export function TypedText({
  text,
  animate = false,
  onDone,
  className,
}: {
  text: string;
  animate?: boolean;
  onDone?: () => void;
  className?: string;
}) {
  const words = text.split(/(\s+)/);
  const [shown, setShown] = useState<number | null>(() => (animate && motionAllowed() ? 0 : null));

  // biome-ignore lint/correctness/useExhaustiveDependencies: typing restarts only with new text
  useEffect(() => {
    if (shown === null) return;
    const count = Math.ceil(words.length / 2);
    const step = Math.min(WORD_MS, MAX_MS / Math.max(1, count));
    const timer = setInterval(() => {
      setShown((n) => {
        if (n === null) return null;
        // Two parts per word (the word and the space after it).
        const next = n + 2;
        if (next >= words.length) {
          clearInterval(timer);
          return null;
        }
        return next;
      });
    }, step);
    return () => clearInterval(timer);
  }, [text]);

  useEffect(() => {
    if (shown === null) onDone?.();
  }, [shown, onDone]);

  if (shown === null) {
    return <p className={className}>{withMoney(text)}</p>;
  }
  return (
    <p className={className} aria-busy="true">
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {withMoney(words.slice(0, shown + 1).join(""))}
        <span className="ml-0.5 inline-block h-[1em] w-0.5 translate-y-0.5 bg-primary" />
      </span>
    </p>
  );
}
