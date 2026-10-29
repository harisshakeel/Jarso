import { CircleAlertIcon } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { type CSSProperties, type ReactNode, Suspense } from "react";
import { Field } from "@/components/form";
import { Button, buttonVariants, Card, CardContent } from "@/components/ui";
import { routes } from "@/config";
import { AcceptInvitationForm, InvitationList, inviteParamsSchema } from "@/features/family";
import {
  findInvitation,
  findMyInvitation,
  INVITATION_GONE,
  listMyInvitations,
  requireRole,
} from "@/features/family/server";
import { isAppError } from "@/lib";

export const metadata: Metadata = { title: "Accept an invitation" };

type SearchParams = PageProps<"/invite">["searchParams"];

const rise = (index: number) => ({ "--rise-index": index }) as CSSProperties;

/** This page's own URL for the invite, so login and family setup can bring the parent back. */
function invitePath(params: { token?: string; code?: string; id?: string }): string {
  const query = new URLSearchParams(
    params.token
      ? { token: params.token }
      : params.code
        ? { code: params.code }
        : params.id
          ? { id: params.id }
          : {},
  ).toString();
  return query ? `${routes.invite}?${query}` : routes.invite;
}

async function InviteContent({ searchParams }: { searchParams: SearchParams }) {
  const params = inviteParamsSchema.parse(await searchParams);
  // One way in per URL: link token, then code, then an id from the parent's own list.
  const token = params.token;
  const code = token ? undefined : params.code;
  const id = token || code ? undefined : params.id;
  const here = invitePath({ token, code, id });

  const { membership } = await requireRole("parent", here);
  if (!membership) {
    const setup = `${routes.parentSetup}?next=${encodeURIComponent(here)}` as Route;
    return (
      <Notice message="Set up your family first. Then you can add your child.">
        <Link href={setup} className={buttonVariants({ size: "lg" })}>
          Set up your family
        </Link>
      </Notice>
    );
  }

  if (id) return <ListedInvitation id={id} />;

  const invite = token ?? code;
  if (!invite) {
    // Request-time and per user: rendered inside Suspense, never cached.
    const invitations = await listMyInvitations();
    return (
      <>
        <InvitationList invitations={invitations} now={Date.now()} className="rise-in" />
        <CodeForm style={rise(1)} />
      </>
    );
  }

  // One lookup per render: it is rate-limited, and the action looks it up again on submit.
  let invitation: Awaited<ReturnType<typeof findInvitation>>;
  try {
    invitation = await findInvitation(invite);
  } catch (error) {
    if (isAppError(error) && error.code === "RATE_LIMITED") {
      return <Notice message={error.message} alert />;
    }
    throw error;
  }

  if (!invitation) return <Gone />;

  return (
    <Card className="rise-in shadow-raised">
      <CardContent>
        <AcceptInvitationForm invite={invite} nickname={invitation.nickname} />
      </CardContent>
    </Card>
  );
}

/** An invitation picked from the list. Only resolves if it is still addressed to this parent. */
async function ListedInvitation({ id }: { id: string }) {
  const invitation = await findMyInvitation(id);
  if (!invitation) return <Gone />;
  return (
    <Card className="rise-in shadow-raised">
      <CardContent>
        <AcceptInvitationForm invitationId={invitation.id} nickname={invitation.nickname} />
      </CardContent>
    </Card>
  );
}

function Gone() {
  return (
    <Notice message={INVITATION_GONE} alert>
      <Link href={routes.parent} className={buttonVariants({ variant: "outline", size: "lg" })}>
        Back to your family
      </Link>
    </Notice>
  );
}

/** No link token: ask for the code the child was shown. Plain GET back to this page. */
function CodeForm({ style }: { style?: CSSProperties }) {
  return (
    <Card className="rise-in" style={style}>
      <CardContent>
        <form action={routes.invite} className="grid gap-6">
          <Field
            name="code"
            label="Invite code"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            required
            description="The 8-letter code on your child's screen or in the email we sent you."
          />
          <Button type="submit" size="lg" className="w-full">
            Continue
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Notice({
  message,
  alert,
  children,
}: {
  message: string;
  alert?: boolean;
  children?: ReactNode;
}) {
  return (
    <Card className="rise-in shadow-raised">
      <CardContent className="grid gap-4">
        <p role={alert ? "alert" : undefined} className="flex items-start gap-2">
          {alert ? <CircleAlertIcon aria-hidden className="mt-0.5 size-5 shrink-0" /> : null}
          {message}
        </p>
        {children ? <div className="flex flex-col gap-3 sm:flex-row">{children}</div> : null}
      </CardContent>
    </Card>
  );
}

function FormSkeleton() {
  return (
    <div aria-hidden className="grid gap-6">
      <div className="shimmer h-24 rounded-lg bg-muted" />
      <div className="shimmer h-24 rounded-lg bg-muted" />
      <div className="shimmer h-6 rounded-lg bg-muted" />
      <div className="shimmer h-11 rounded-full bg-muted" />
    </div>
  );
}

export default function InvitePage({ searchParams }: PageProps<"/invite">) {
  return (
    <div className="mx-auto grid w-full max-w-lg gap-6">
      <header className="grid gap-3">
        <p className="eyebrow">Invitation</p>
        <h1 className="text-balance text-h1">Your child asked to join.</h1>
        <p className="text-ink-2">
          Check their nickname and choose a PIN. They sign in with these and your family code.
        </p>
      </header>
      <Suspense fallback={<FormSkeleton />}>
        <InviteContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
