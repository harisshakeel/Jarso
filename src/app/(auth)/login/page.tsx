import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
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

async function SignInFormWithNext({
  searchParams,
}: {
  searchParams: PageProps<"/login">["searchParams"];
}) {
  const { next } = await searchParams;
  return <SignInForm next={typeof next === "string" ? next : undefined} />;
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
