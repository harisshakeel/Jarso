import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { JarsoMark } from "@/components/brand";
import { buttonVariants, Card, CardContent } from "@/components/ui";
import { routes } from "@/config";

/** design.md §6 Empty state for a family with no children: mark, one sentence, the next step. */
export function FirstChildCard() {
  return (
    <Card className="rise-in shadow-raised">
      <CardContent className="flex flex-col items-center gap-4 text-center">
        <JarsoMark size={64} />
        <p className="text-h3">Add your first child to get started.</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href={routes.parentNewChild} className={buttonVariants({ size: "lg" })}>
            <PlusIcon aria-hidden />
            Add a child
          </Link>
          <Link href={routes.invite} className={buttonVariants({ variant: "outline", size: "lg" })}>
            Accept an invitation
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
