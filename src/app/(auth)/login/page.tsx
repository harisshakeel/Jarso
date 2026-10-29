import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FormError } from "@/components/form";
import {
  buttonVariants,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import { routes } from "@/config";
import { SignInForm } from "@/features/auth";

export const metadata: Metadata = { title: "Sign in" };

/** `?error=` codes set by the auth route handlers (design.md §9: calm, plain, no blame). */
const linkErrors: Record<string, string> = {
  auth_confirm:
    "We couldn't confirm your email. The link may have expired or been used already. Try signing in, or sign up again for a new link.",
  auth_callback: "We couldn't finish signing you in. Please try again.",
};

async function SignInFormWithNext({
  searchParams,
}: {
  searchParams: PageProps<"/login">["searchParams"];
}) {
  const { next, error } = await searchParams;
  const linkError = typeof error === "string" ? linkErrors[error] : undefined;
  return (
    <div className="grid gap-4">
      <FormError message={linkError} />
      <SignInForm next={typeof next === "string" ? next : undefined} />
    </div>
  );
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <div className="grid w-full max-w-sm gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Welcome back.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<SignInForm />}>
            <SignInFormWithNext searchParams={searchParams} />
          </Suspense>
        </CardContent>
      </Card>
      <Link href={routes.childSignIn} className={buttonVariants({ variant: "link", size: "lg" })}>
        Are you a kid? Sign in here
      </Link>
    </div>
  );
}
