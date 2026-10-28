import Link from "next/link";
import { buttonVariants } from "@/components/ui";
import { routes, siteConfig } from "@/config";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="font-semibold text-4xl tracking-tight">{siteConfig.name}</h1>
      <p className="text-muted-foreground">Foundation is ready. Build features in src/features.</p>
      <div className="flex gap-3">
        <Link href={routes.login} className={buttonVariants()}>
          Sign in
        </Link>
        <Link href={routes.signup} className={buttonVariants({ variant: "outline" })}>
          Create account
        </Link>
      </div>
    </main>
  );
}
