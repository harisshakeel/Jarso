import Link from "next/link";
import { JarsoMark } from "@/components/brand";
import { ThemeSwitch } from "@/components/theme";
import { buttonVariants } from "@/components/ui";
import { routes, siteConfig } from "@/config";
import { landingCopy } from "../copy";

/**
 * Spec §3.0. Sticky, blurred paper header: the mark, two section links from 768 px, then Log in,
 * Sign up and the theme switch. Kids reach their own sign-in from the hero and from Log in's
 * "Are you a kid?" link.
 */
export function LandingHeader() {
  const { nav } = landingCopy;
  return (
    <header className="sticky top-0 z-40 border-hairline border-b bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur-[16px]">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-1 px-4 sm:gap-2 sm:px-6">
        <Link
          href={routes.home}
          className="-mx-2 mr-auto flex min-h-11 items-center gap-2 rounded-full px-2 font-extrabold text-h3 text-primary"
        >
          <JarsoMark size={32} priority />
          <span className="max-[379px]:sr-only">{siteConfig.name}</span>
        </Link>
        <nav aria-label="Sections" className="hidden items-center md:flex">
          <a href="#how" className={buttonVariants({ variant: "ghost" })}>
            {nav.how}
          </a>
          <Link href={routes.safety} className={buttonVariants({ variant: "ghost" })}>
            {nav.safety}
          </Link>
        </nav>
        <Link
          href={routes.login}
          className={buttonVariants({ variant: "ghost", className: "px-4" })}
        >
          {nav.logIn}
        </Link>
        <Link href={routes.signup} className={buttonVariants({ className: "px-4" })}>
          {nav.signUp}
        </Link>
        <ThemeSwitch />
      </div>
    </header>
  );
}

export function LandingFooter() {
  const { nav, footer } = landingCopy;
  return (
    <footer className="border-hairline border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-10 sm:flex-row sm:items-center sm:gap-6 sm:px-6">
        <p className="flex items-center gap-2 font-extrabold text-h3 text-primary">
          <JarsoMark size={28} />
          {siteConfig.name}
        </p>
        <p className="text-ink-2 text-sm sm:flex-1">{footer.line}</p>
        <nav aria-label="Footer" className="-ml-4 flex flex-wrap sm:ml-0">
          <Link
            href={routes.safety}
            className={buttonVariants({ variant: "ghost", className: "px-4" })}
          >
            {nav.safety}
          </Link>
          <Link
            href={routes.login}
            className={buttonVariants({ variant: "ghost", className: "px-4" })}
          >
            {nav.logIn}
          </Link>
          <Link
            href={routes.signup}
            className={buttonVariants({ variant: "ghost", className: "px-4" })}
          >
            {nav.signUp}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
