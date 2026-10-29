import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { buttonVariants, Card } from "@/components/ui";
import { routes } from "@/config";
import type { ChildSummary } from "../types";
import { RemoveChildDialog } from "./remove-child-dialog";
import { RenameChildForm } from "./rename-child-form";
import { SetPinForm } from "./set-pin-form";

/** Each child with everything a parent can do to the account: rename, reset PIN, remove. */
export function ChildrenSettingsList({ items }: { items: ChildSummary[] }) {
  return (
    <div className="grid gap-4">
      {items.length === 0 ? (
        <p className="text-ink-2">No children yet.</p>
      ) : (
        <Card size="sm">
          <ul className="divide-y divide-hairline">
            {items.map((child) => (
              <li
                key={child.id}
                className="flex flex-wrap items-center gap-3 px-(--card-spacing) py-3 first:pt-0 last:pb-0"
              >
                <span
                  aria-hidden
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary font-extrabold text-secondary-foreground"
                >
                  {child.nickname.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate font-bold">{child.nickname}</span>
                <div className="flex flex-wrap items-center gap-2">
                  <RenameChildForm child={child} />
                  <SetPinForm child={child} />
                  <RemoveChildDialog child={child} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Link
        href={routes.parentNewChild}
        className={buttonVariants({ variant: "secondary", size: "lg", className: "sm:w-fit" })}
      >
        <PlusIcon aria-hidden />
        Add a child
      </Link>
    </div>
  );
}
