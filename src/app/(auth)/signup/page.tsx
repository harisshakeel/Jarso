import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { SignUpForm } from "@/features/auth";

export const metadata: Metadata = { title: "Create account" };

async function SignUpFormWithNext({
  searchParams,
}: {
  searchParams: PageProps<"/signup">["searchParams"];
}) {
  const { next } = await searchParams;
  return <SignUpForm next={typeof next === "string" ? next : undefined} />;
}

export default function SignUpPage({ searchParams }: PageProps<"/signup">) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Create account</CardTitle>
        <CardDescription>Get started in seconds.</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<SignUpForm />}>
          <SignUpFormWithNext searchParams={searchParams} />
        </Suspense>
      </CardContent>
    </Card>
  );
}
