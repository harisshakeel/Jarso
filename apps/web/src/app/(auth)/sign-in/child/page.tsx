import type { Metadata } from "next";
import Link from "next/link";
import { JarsoMark } from "@/components/brand";
import { buttonVariants } from "@/components/ui";
import { routes } from "@/config";
import { ChildSignInForm } from "@/features/family";

export const metadata: Metadata = { title: "Kids sign in" };

/** Child PIN sign-in (public). Nothing here reads the session, so it stays static. */
export default function ChildSignInPage() {
  return (
    <div className="grid w-full max-w-sm gap-6">
      <header className="grid justify-items-center gap-3 text-center">
        <JarsoMark size={56} priority />
        <h1 className="text-balance text-h1">Welcome back. Let's sign in.</h1>
        <p className="text-ink-2">Use your family code, your nickname and your PIN.</p>
      </header>
      <ChildSignInForm />
      <nav aria-label="Other ways in" className="grid justify-items-center gap-1">
        <Link href={routes.childStart} className={buttonVariants({ variant: "link", size: "lg" })}>
          New here? Start here
        </Link>
        <Link href={routes.login} className={buttonVariants({ variant: "link", size: "lg" })}>
          I'm a parent
        </Link>
      </nav>
    </div>
  );
}
