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

async function RailName() {
  const me = await whoAmI();
  return (
    <>
      <Disc initial={me.initial} />
      <span className="max-w-20 truncate font-semibold text-xs">{me.name ?? "You"}</span>
    </>
  );
}

/** The same person at the foot of the left rail, with their first name, opening Settings. */
export function RailAvatar() {
  return (
    <Link
      href={routes.settings}
      aria-label="Account"
      className="mx-auto flex min-h-11 w-20 flex-col items-center gap-1 rounded-xl py-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
    >
      <Suspense
        fallback={
          <>
            <Disc initial={null} />
            <span className="font-semibold text-xs">You</span>
          </>
        }
      >
        <RailName />
      </Suspense>
    </Link>
  );
}
