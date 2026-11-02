import type { Topic } from "@jarso/core/learning";
import { renderText } from "@jarso/core/learning";

/** A topic's explanation and worked example (FR08). The practice question renders below it. */
export function TopicView({ topic, currency }: { topic: Topic; currency: string }) {
  return (
    <article className="grid gap-5">
      <p className="text-lg text-ink-2">{renderText(topic.intro, currency)}</p>
      <div className="grid gap-3">
        {topic.explanation.slice(0, 2).map((paragraph) => (
          <p key={paragraph}>{renderText(paragraph, currency)}</p>
        ))}
        {topic.explanation.length > 2 ? (
          <details className="group grid gap-3">
            <summary className="inline-flex min-h-11 w-fit cursor-pointer list-none items-center rounded-full font-semibold text-primary underline-offset-4 hover:underline">
              <span className="group-open:hidden">Tell me more</span>
              <span className="hidden group-open:inline">That's enough</span>
            </summary>
            {topic.explanation.slice(2).map((paragraph) => (
              <p key={paragraph}>{renderText(paragraph, currency)}</p>
            ))}
          </details>
        ) : null}
      </div>
      <section aria-labelledby="worked-example" className="grid gap-2 rounded-2xl bg-secondary p-5">
        <h2 id="worked-example" className="font-bold text-h3">
          {topic.example.title}
        </h2>
        <ol className="grid list-decimal gap-1 pl-5">
          {topic.example.lines.map((line) => (
            <li key={line}>{renderText(line, currency)}</li>
          ))}
        </ol>
      </section>
    </article>
  );
}
