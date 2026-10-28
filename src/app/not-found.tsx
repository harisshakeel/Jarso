import Link from "next/link";
import { buttonVariants } from "@/components/ui";
import { routes } from "@/config";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <h2 className="font-semibold text-xl">Page not found</h2>
      <Link href={routes.home} className={buttonVariants({ variant: "outline" })}>
        Go home
      </Link>
    </main>
  );
}
