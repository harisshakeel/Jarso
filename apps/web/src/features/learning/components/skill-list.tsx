import { cn } from "@/lib";
import { type SkillLevel, skillLevelLabels, skills, topicTitles } from "../skills";
import type { SkillProgress } from "../types";

/**
 * FR10 progress per skill: a word plus three dots, never next to money (invariant 11). Grouped by
 * topic in catalogue order.
 */
export function SkillList({
  progress,
  heading = "Your skills",
}: {
  progress: SkillProgress[];
  heading?: string;
}) {
  const levelOf = (key: string): SkillLevel => progress.find((p) => p.skillKey === key)?.level ?? 0;
  const topics = [...new Set(skills.map((s) => s.topic))];
  return (
    <section aria-labelledby="skills-heading" className="grid gap-4">
      <h2 id="skills-heading" className="text-h3">
        {heading}
      </h2>
      {topics.map((topic) => (
        <div key={topic} className="grid gap-2">
          <h3 className="eyebrow">{topicTitles[topic]}</h3>
          <ul className="grid gap-2">
            {skills
              .filter((s) => s.topic === topic)
              .map((skill) => {
                const level = levelOf(skill.key);
                return (
                  <li
                    key={skill.key}
                    className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-card px-4 py-3"
                  >
                    <span className="font-semibold">{skill.label}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-ink-2 text-sm">{skillLevelLabels[level]}</span>
                      <span aria-hidden className="flex gap-1">
                        {[1, 2, 3].map((dot) => (
                          <span
                            key={dot}
                            className={cn(
                              "size-2.5 rounded-full",
                              dot <= level ? "bg-primary" : "bg-muted",
                            )}
                          />
                        ))}
                      </span>
                    </span>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </section>
  );
}
