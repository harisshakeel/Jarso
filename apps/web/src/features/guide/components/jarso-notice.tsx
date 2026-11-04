import { jarsoNoticeCopy } from "@jarso/core/guide";
import { BotIcon } from "lucide-react";
import Link from "next/link";
import { routes } from "@/config";

/**
 * Told to the parent when they add a child (ADR 0011): Jarso is on by default, what it sends to
 * Anthropic, and that they can turn it off. Shown only where Jarso runs on this deployment.
 */
export function JarsoNotice() {
  return (
    <section
      aria-labelledby="jarso-notice"
      className="grid gap-2 rounded-xl bg-secondary p-4 text-sm"
    >
      <h2 id="jarso-notice" className="flex items-center gap-2 font-semibold">
        <BotIcon aria-hidden className="size-4" />
        {jarsoNoticeCopy.title}
      </h2>
      <p>
        {jarsoNoticeCopy.body}{" "}
        <Link
          href={routes.safety}
          className="font-semibold text-primary underline underline-offset-4"
        >
          {jarsoNoticeCopy.safetyLink}
        </Link>
      </p>
    </section>
  );
}
