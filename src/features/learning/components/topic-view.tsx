import { renderText } from "../text";
import type { Topic } from "../types";

/** A topic's explanation and worked example (FR08). The practice question renders below it. */
export function TopicView({ topic, currency }: { topic: Topic; currency: string }) {
  return (
    <article className="grid gap-5">
      <p className="text-lg text-ink-2">{renderText(topic.intro, currency)}</p>
      <div className="grid gap-3">
        {topic.explanation.map((paragraph) => (
          <p key={paragraph}>{renderText(paragraph, currency)}</p>
        ))}
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
