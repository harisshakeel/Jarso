import { ArrowRightIcon, PlayIcon } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui";
import { routes } from "@/config";
import { topicTitles } from "../skills";
import type { JourneyMission } from "../types";

/**
 * The current mission as the hero of Learn: day and topic, the title, one line of what it is
 * about, and the one keycap. Done and locked missions sit in the compact path beneath it.
 */
export function MissionHero({ mission }: { mission: JourneyMission }) {
  return (
    <Card className="shadow-raised">
      <CardContent>
        <section aria-labelledby="mission-hero-heading" className="grid gap-3">
          <p className="eyebrow flex items-center gap-2">
            <PlayIcon aria-hidden className="size-4" />
            Day {mission.day} · {topicTitles[mission.topic]}
          </p>
          <h2 id="mission-hero-heading" className="text-balance text-h2">
            {mission.title}
          </h2>
          <p className="text-ink-2">
            {mission.inProgress ? "Started. Pick up where you left off." : mission.summary}
          </p>
          <Link
            href={routes.childMission(mission.key)}
            aria-current="step"
            className="keycap inline-flex h-11 w-fit items-center gap-2 rounded-full bg-primary px-6 font-bold text-primary-foreground"
          >
            {mission.inProgress ? "Continue" : "Start mission"}
            <ArrowRightIcon aria-hidden className="size-5" />
          </Link>
        </section>
      </CardContent>
    </Card>
  );
}
