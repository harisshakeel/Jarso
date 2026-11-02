"use client";

import { ChevronDownIcon } from "lucide-react";
import Link from "next/link";
import {
  buttonVariants,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui";
import { routes } from "@/config";
import { landingCopy } from "../copy";

// The soft teal of selected chips (design.md §2.4), not the bright accent.
const row =
  "min-h-11 rounded-xl px-3 font-semibold text-base focus:bg-secondary focus:text-secondary-foreground data-highlighted:bg-secondary data-highlighted:text-secondary-foreground";
const label = "px-3 pt-2 pb-1 font-semibold text-muted-foreground text-xs";

/**
 * Spec §3.0: the navbar's one way in. A menu (not a modal) with the four entry points, grouped
 * for parents and kids.
 */
export function GetStartedMenu() {
  const { nav } = landingCopy;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={buttonVariants({ className: "gap-1.5 px-4" })}>
        {nav.start}
        <ChevronDownIcon aria-hidden className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-60 rounded-2xl p-2">
        <DropdownMenuGroup>
          <DropdownMenuLabel className={label}>{nav.parents}</DropdownMenuLabel>
          <DropdownMenuLinkItem render={<Link href={routes.login} />} className={row}>
            {nav.logIn}
          </DropdownMenuLinkItem>
          <DropdownMenuLinkItem render={<Link href={routes.signup} />} className={row}>
            {nav.setUp}
          </DropdownMenuLinkItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="my-1" />
        <DropdownMenuGroup>
          <DropdownMenuLabel className={label}>{nav.kids}</DropdownMenuLabel>
          <DropdownMenuLinkItem render={<Link href={routes.childSignIn} />} className={row}>
            {nav.kidSignIn}
          </DropdownMenuLinkItem>
          <DropdownMenuLinkItem render={<Link href={routes.childStart} />} className={row}>
            {nav.kidStart}
          </DropdownMenuLinkItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
