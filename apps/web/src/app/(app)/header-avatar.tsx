import { UserRoundIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { RailLink } from "@/components/shell";
import { routes } from "@/config";
import { getCurrentUser } from "@/features/auth/server";
import { currentRole, getChildNickname } from "@/features/family/server";
import { getProfile } from "@/features/profiles/server";
import { logger } from "@/lib";

/** The disc itself: an initial when we know a name, a person outline otherwise. */
function Disc({ initial }: { initial: string | null }) {
  return (
    <span className="grid size-9 place-items-center rounded-full bg-primary font-extrabold text-primary-foreground">
      {initial ?? <UserRoundIcon aria-hidden className="size-5" />}
    </span>
  );
}

/** Who is signed in: their first name (a child's nickname) and its initial. Fails open to none. */
async function whoAmI(): Promise<{ name: string | null; initial: string | null }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { name: null, initial: null };
    const role = await currentRole();
    const full =
      role === "child"
        ? await getChildNickname()
        : ((await getProfile(user.id)).fullName ?? user.email ?? "");
    const name = full.trim().split(/\s+/)[0] ?? "";
    return { name: name || null, initial: name.charAt(0).toUpperCase() || null };
  } catch (error) {
    unstable_rethrow(error);
    logger.warn("Avatar lookup failed; showing the plain disc", { error });
    return { name: null, initial: null };
  }
}

function Name({ name, label }: { name: string | null; label: string }) {
  return (
    <span className="grid min-w-0 text-center lg:text-left">
      <span className="max-w-20 truncate font-semibold text-xs lg:max-w-none lg:font-bold lg:text-base lg:text-foreground">
        {name ?? "You"}
      </span>
      <span className="hidden text-muted-foreground text-sm lg:block">{label}</span>
    </span>
  );
}

async function RailName({ label }: { label: string }) {
  const me = await whoAmI();
  return (
    <>
      <Disc initial={me.initial} />
      <Name name={me.name} label={label} />
    </>
  );
}

/**
 * The signed-in person at the foot of the sidebar, opening their settings page ("Me" for a
 * child, "Settings" for a parent): disc over first name from 768 px, a row with the page's name
 * under the person's from 1024 px. It replaces a settings tab, so it lights up on that page.
 */
export function RailAvatar({ href, label }: { href: Route; label: string }) {
  return (
    <RailLink
      href={href}
      label={label}
      className="mx-auto flex min-h-11 w-20 flex-col items-center gap-1 rounded-2xl py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:w-full lg:flex-row lg:gap-3 lg:px-3"
    >
      <Suspense
        fallback={
          <>
            <Disc initial={null} />
            <Name name={null} label={label} />
          </>
        }
      >
        <RailName label={label} />
      </Suspense>
    </RailLink>
  );
}

async function HeaderDisc() {
  const me = await whoAmI();
  return <Disc initial={me.initial} />;
}

/** The person in the phone header (below 768 px, where the sidebar is a tab bar), opening Settings. */
export function HeaderAvatar() {
  return (
    <Link
      href={routes.settings}
      aria-label="Account"
      className="grid size-11 place-items-center rounded-full transition-colors hover:bg-muted"
    >
      <Suspense fallback={<Disc initial={null} />}>
        <HeaderDisc />
      </Suspense>
    </Link>
  );
}
