import type { Route } from "next";
import Link from "next/link";
import { JarsoMark } from "@/components/brand";
import { siteConfig } from "@/config";

/**
 * The sidebar's top: the mark (with the name from 1024 px) linking to the role's home, and for
 * parents a "Grown-ups" tag so the parent area is unmistakable at a glance. Named "Jarso home"
 * so it never collides with the Jarso tab.
 */
export function NavBrand({ href, tag }: { href: Route; tag?: string }) {
  return (
    <div className="grid justify-items-center gap-2 lg:flex lg:items-center lg:justify-between">
      <Link
        href={href}
        aria-label={`${siteConfig.name} home`}
        className="flex min-h-11 items-center gap-2 rounded-full px-1 font-extrabold text-h3 text-primary"
      >
        <JarsoMark size={36} priority />
        <span className="sr-only lg:not-sr-only">{siteConfig.name}</span>
      </Link>
      {tag ? (
        <span className="rounded-full bg-muted px-2.5 py-1 font-bold text-ink-2 text-xs">
          {tag}
        </span>
      ) : null}
    </div>
  );
}
