import type { Route } from "next";
import Link from "next/link";
import { JarsoMark, JarsoWordmark } from "@/components/brand";
import { buttonVariants } from "@/components/ui";
import { routes, siteConfig } from "@/config";

// Child routes land in later slice-1 tasks; cast until their pages exist (typedRoutes).
const childSignIn = routes.childSignIn as Route;
const childStart = routes.childStart as Route;

/** Sign-in landing (design.md §14.7): wordmark on white, one way in for kids, one for parents. */
export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col bg-card px-4 py-12 sm:px-6 sm:py-16">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-10 text-center">
        {/* The wordmark artwork is opaque white, so dark mode shows the mark and name instead (design.md §1). */}
        <JarsoWordmark width={288} priority className="w-60 sm:w-72 dark:hidden" />
        <p className="hidden items-center gap-3 font-extrabold text-display text-primary dark:flex">
          <JarsoMark size={56} />
          {siteConfig.name}
        </p>

        <div className="flex flex-col gap-3">
          <h1 className="text-balance font-extrabold text-display">Spend some. Save some.</h1>
          <p className="text-ink-2">Plan your pocket money with your family.</p>
        </div>

        <section aria-labelledby="sign-in" className="flex w-full flex-col gap-3">
          <h2 id="sign-in" className="sr-only">
            Sign in
          </h2>
          <Link href={childSignIn} className={buttonVariants({ size: "lg", className: "w-full" })}>
            I'm a kid
          </Link>
          <Link
            href={routes.login}
            className={buttonVariants({ variant: "outline", size: "lg", className: "w-full" })}
          >
            I'm a parent
          </Link>
        </section>

        <section aria-labelledby="new-here" className="flex flex-col items-center gap-1">
          <h2 id="new-here" className="eyebrow">
            New here?
          </h2>
          <div className="flex flex-col items-center sm:flex-row sm:gap-2">
            <Link href={childStart} className={buttonVariants({ variant: "link", size: "lg" })}>
              Kids, start here
            </Link>
            <Link href={routes.signup} className={buttonVariants({ variant: "link", size: "lg" })}>
              Parents, set up your family
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
