import type { Metadata } from "next";
import Link from "next/link";
import { JarsoMark } from "@/components/brand";
import { buttonVariants } from "@/components/ui";
import { routes } from "@/config";
import { StartOnboardingForm } from "@/features/family";

export const metadata: Metadata = { title: "Start here" };

/** Child-started onboarding (public). Nothing here reads the session, so it stays static. */
export default function StartPage() {
  return (
    <div className="grid w-full max-w-sm gap-6">
      <header className="grid justify-items-center gap-3 text-center">
        <JarsoMark size={56} priority />
        <h1 className="text-balance text-h1">New here? Ask a parent.</h1>
        <p className="text-ink-2">
          Tell us your nickname and your parent's email. We'll ask them to say yes.
        </p>
      </header>
      <StartOnboardingForm />
      <Link href={routes.childSignIn} className={buttonVariants({ variant: "link", size: "lg" })}>
        I already have a family code
      </Link>
    </div>
  );
}
