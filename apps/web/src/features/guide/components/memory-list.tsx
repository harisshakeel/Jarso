"use client";

import type { Memory } from "@jarso/core/guide";
import { guideCopy, parentGuideCopy } from "@jarso/core/guide";
import { BrainIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormError } from "@/components/form";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Card,
  CardContent,
} from "@/components/ui";
import { runOnline } from "@/features/offline";
import { forgetMemoryAction } from "../server/actions";

type MemoryListProps = {
  memories: Memory[];
  /** "you" for the child, the nickname for a parent. */
  whose: string;
};

/**
 * "What Jarso remembers" (ADR 0011, slice 8): every fact Jarso kept, with a Forget button on
 * each. Shown to the child in Settings and to the parent on the chats page, so nothing Jarso
 * keeps is ever hidden from either.
 */
export function MemoryList({ memories, whose }: MemoryListProps) {
  return (
    <Card>
      <CardContent>
        <section aria-labelledby="memories-heading" className="grid gap-3">
          <h2 id="memories-heading" className="flex items-center gap-2 text-h3">
            <BrainIcon aria-hidden className="size-5" />
            {guideCopy.memories.title}
          </h2>
          <p className="text-ink-2 text-sm">
            {whose === "you" ? guideCopy.memories.intro : parentGuideCopy.memoriesIntro(whose)}
          </p>
          {memories.length === 0 ? (
            <p className="text-ink-2">{guideCopy.memories.empty}</p>
          ) : (
            <ul className="grid gap-2">
              {memories.map((memory) => (
                <MemoryRow key={memory.id} memory={memory} />
              ))}
            </ul>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

function MemoryRow({ memory }: { memory: Memory }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<{ code: string; message: string }>();
  const [open, setOpen] = useState(false);
  function forget() {
    setError(undefined);
    start(async () => {
      const result = await runOnline(() => forgetMemoryAction(null, { memoryId: memory.id }));
      // After an await, updates leave the transition unless wrapped again (see rule-row.tsx).
      start(() => {
        setOpen(false);
        if (!result.ok) return setError(result.error);
        router.refresh();
      });
    });
  }
  return (
    <li className="grid gap-1 rounded-xl border border-hairline px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span>
          <span className="text-ink-2 text-sm">{guideCopy.memories.kinds[memory.kind]}: </span>
          {memory.text}
        </span>
        {/* Forgetting can't be undone, so it asks first (design.md §6). */}
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="lg"
                aria-label={`${guideCopy.memories.forget}: ${memory.text}`}
              />
            }
          >
            <XIcon aria-hidden className="size-4" />
            {guideCopy.memories.forget}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{guideCopy.memories.forgetTitle}</AlertDialogTitle>
              <AlertDialogDescription>
                {guideCopy.memories.forgetBody(memory.text)}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{guideCopy.memories.keep}</AlertDialogCancel>
              <Button variant="destructive" loading={pending} onClick={forget}>
                {guideCopy.memories.forget}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      <FormError error={error} />
    </li>
  );
}
