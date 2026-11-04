import { dashboardCopy, slotFor } from "@jarso/core/dashboard";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { routes } from "@/config";
import { SeriesDot } from "./series";

/**
 * Home's one row of children (2026-11-04): a chip per child, in their colour and headed by
 * their exact nickname, opening their page, and "Add a child" at the end. One line tall, so
 * Home stays on one screen; everything about how a child is doing lives on Children.
 */
export function ChildRow({ items }: { items: { id: string; nickname: string }[] }) {
  return (
    <nav aria-label="Children">
      <ul className="flex flex-wrap gap-2">
        {items.map((child, index) => (
          <li key={child.id}>
            <Link
              href={routes.parentChild(child.id)}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-hairline bg-card px-4 font-semibold hover:bg-muted"
            >
              <SeriesDot slot={slotFor(index)} />
              {/* A heading per child, named exactly by the nickname, as the tile was. */}
              <h3 className="font-semibold">{child.nickname}</h3>
            </Link>
          </li>
        ))}
        <li>
          <Link
            href={routes.parentNewChild}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-hairline-strong border-dashed px-4 font-semibold text-primary hover:bg-card"
          >
            <PlusIcon aria-hidden className="size-4" />
            {dashboardCopy.addChild}
          </Link>
        </li>
      </ul>
    </nav>
  );
}
