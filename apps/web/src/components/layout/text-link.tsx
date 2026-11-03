import { cn } from "cn";
import type { Route } from "next";
import Link from "next/link";
import type { ComponentProps } from "react";

/** The one inline action link style: primary, bold, 44 px target, underline on hover. */
export const textLinkClass =
  "inline-flex min-h-11 w-fit items-center gap-1.5 font-semibold text-primary underline-offset-4 hover:underline [&_svg]:size-5 [&_svg]:shrink-0";

export function TextLink({
  className,
  href,
  ...props
}: Omit<ComponentProps<typeof Link>, "href"> & { href: Route }) {
  return <Link href={href} className={cn(textLinkClass, className)} {...props} />;
}
