"use client";

import { Card, CardContent } from "@/components/ui";
import { GuideThread, type GuideThreadProps } from "./guide-thread";

/**
 * "Ask Jarso" (FR07, ADR 0011): the chat window on Home, the thread in a card. The AI label and
 * the note that parents can see chats are always shown; the intro card comes first for a child
 * who has never chatted. The "Open" link beside the title goes to the full Jarso page.
 */
export function AskJarso({
  introNeeded,
  ...thread
}: Omit<GuideThreadProps, "variant" | "introNeeded" | "reopened"> & { introNeeded: boolean }) {
  return (
    <Card className="rise-in border-accent-text/30">
      <CardContent>
        <GuideThread introNeeded={introNeeded} variant="card" {...thread} />
      </CardContent>
    </Card>
  );
}
