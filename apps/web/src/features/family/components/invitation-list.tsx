import type { Route } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { JarsoMark } from "@/components/brand";
import { buttonVariants, Card, CardContent } from "@/components/ui";
import { routes } from "@/config";
import { cn } from "@/lib";
import { sentAgo } from "../sent-ago";
import type { PendingInvitation } from "../types";
import { RefreshInvitationsButton } from "./refresh-invitations-button";

type InvitationListProps = {
  invitations: PendingInvitation[];
  /** Request time in ms, for "Sent 2 hours ago". */
  now: number;
  className?: string;
  style?: CSSProperties;
};

/** Invitations children sent to this parent's email. Each row opens the accept form. */
export function InvitationList({ invitations, now, className, style }: InvitationListProps) {
  return (
    <section
      aria-labelledby="invitations-title"
      className={cn("grid gap-4", className)}
      style={style}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="invitations-title" className="text-h2">
          Waiting for you
        </h2>
        {invitations.length > 0 ? <RefreshInvitationsButton /> : null}
      </div>
      {invitations.length === 0 ? (
        // design.md §6 Empty state: mark, one sentence, one action.
        <Card>
          <CardContent className="flex flex-col items-center gap-4 text-center">
            <JarsoMark size={48} />
            <p>No invitations waiting. If your child just sent one, refresh.</p>
            <RefreshInvitationsButton />
          </CardContent>
        </Card>
      ) : (
        <Card size="sm">
          <ul className="divide-y divide-hairline">
            {invitations.map((invitation) => (
              <li
                key={invitation.id}
                className="flex items-center gap-3 px-(--card-spacing) py-3 first:pt-0 last:pb-0"
              >
                <span
                  aria-hidden
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary font-extrabold text-secondary-foreground"
                >
                  {invitation.nickname.charAt(0).toUpperCase()}
                </span>
                <span className="grid min-w-0 flex-1">
                  <span className="truncate font-bold">{invitation.nickname}</span>
                  <time dateTime={invitation.createdAt} className="text-muted-foreground text-sm">
                    {sentAgo(invitation.createdAt, now)}
                  </time>
                </span>
                <Link
                  href={`${routes.invite}?id=${invitation.id}` as Route}
                  className={buttonVariants()}
                >
                  Accept<span className="sr-only"> {invitation.nickname}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}
