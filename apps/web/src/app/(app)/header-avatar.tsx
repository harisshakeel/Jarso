import { UserRoundIcon } from "lucide-react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
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

async function Avatar() {
  let initial: string | null = null;
  try {
    const user = await getCurrentUser();
    if (user) {
      const role = await currentRole();
      const name =
        role === "child"
          ? await getChildNickname()
          : ((await getProfile(user.id)).fullName ?? user.email ?? "");
      initial = name.trim().charAt(0).toUpperCase() || null;
    }
  } catch (error) {
    unstable_rethrow(error);
    logger.warn("Header avatar lookup failed; showing the plain disc", { error });
  }
  return <Disc initial={initial} />;
}

/**
 * The header's right end: the signed-in person's initial in a disc, which opens Settings (named
 * "Account" so the rail's own Settings link stays the one called that). Reads
 * the session, so it streams in behind its own Suspense; the plain disc shows meanwhile. Fails
 * open to the plain disc, which still opens Settings.
 */
export function HeaderAvatar() {
  return (
    <Link
      href={routes.settings}
      aria-label="Account"
      className="-mr-1 grid size-11 place-items-center rounded-full transition-colors hover:bg-muted focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
    >
      <Suspense fallback={<Disc initial={null} />}>
        <Avatar />
      </Suspense>
    </Link>
  );
}
