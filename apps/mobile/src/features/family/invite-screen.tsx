import {
  acceptInvitationSchema,
  acceptListedInvitationSchema,
  invitationGone,
  inviteCopy,
  inviteParamsSchema,
  type PendingInvitation,
  sentAgo,
} from "@jarso/core/family";
import { useRouter } from "expo-router";
import { Fragment, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { z } from "zod";
import { Card, CardSeparator, ListRow } from "@/components/screen";
import { Notice, useSendOnce } from "@/components/sheet";
import { Button, Text } from "@/components/ui";
import { Field } from "@/features/auth";
import { actionErrorMessage, flash, isAppError, toUserMessage } from "@/lib";
import {
  type ChildFieldErrors,
  ChildFields,
  type ChildFieldValues,
  consentValue,
  JarsoNotice,
} from "./add-child-form";
import { useAcceptInvitation, useInvitationLookup, useInvitations } from "./use-invitations";

type InviteRouteParams = Record<string, string | string[] | undefined>;

/** Back to Family: where a parent goes when an invitation is gone or not wanted now. */
function useLeave() {
  const router = useRouter();
  return () => router.replace("/(parent)/(tabs)");
}

function Waiting() {
  return (
    <View className="items-center py-8">
      <ActivityIndicator accessibilityLabel="Loading" />
    </View>
  );
}

/** A read that failed: its message and Try again. */
function Failed({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <Card className="gap-4">
      <Text accessibilityRole="alert">{toUserMessage(error)}</Text>
      <Button variant="outline" accessibilityLabel="Try again" onPress={onRetry}>
        <Text>Try again</Text>
      </Button>
    </Card>
  );
}

/** Unknown, expired and used invitations read the same (none can be told apart). */
function Gone() {
  const leave = useLeave();
  return (
    <Card className="gap-4">
      <Text accessibilityRole="alert">{invitationGone}</Text>
      <Button variant="outline" accessibilityLabel={inviteCopy.backToFamily} onPress={leave}>
        <Text>{inviteCopy.backToFamily}</Text>
      </Button>
    </Card>
  );
}

/**
 * The accept form (the web's AcceptInvitationForm): the child's nickname prefilled, a PIN and
 * consent. By link or code (`invite`) or from the parent's list (`invitationId`).
 */
function AcceptForm({
  invite,
  invitationId,
  nickname,
}: {
  invite?: string;
  invitationId?: string;
  nickname: string;
}) {
  const router = useRouter();
  const leave = useLeave();
  const accept = useAcceptInvitation();
  const once = useSendOnce();
  const [values, setValues] = useState<ChildFieldValues>({ nickname, pin: "", consent: false });
  const [fieldErrors, setFieldErrors] = useState<ChildFieldErrors>();
  const [error, setError] = useState<string>();

  const submit = () =>
    once(async () => {
      setError(undefined);
      const fields = { ...values, consent: consentValue(values.consent) };
      const parsed = invitationId
        ? acceptListedInvitationSchema.safeParse({ ...fields, invitationId })
        : acceptInvitationSchema.safeParse({ ...fields, invite });
      if (!parsed.success) {
        setFieldErrors(z.flattenError(parsed.error as z.ZodError).fieldErrors as ChildFieldErrors);
        return;
      }
      setFieldErrors(undefined);
      try {
        const child = await accept.mutateAsync(parsed.data);
        flash(inviteCopy.added(child.nickname));
        router.replace(`/(parent)/children/${child.id}`);
      } catch (cause) {
        setValues((current) => ({ ...current, pin: "" }));
        if (isAppError(cause) && cause.fieldErrors) {
          setFieldErrors(cause.fieldErrors as ChildFieldErrors);
          return;
        }
        setError(await actionErrorMessage(cause));
      }
    });

  return (
    <View className="gap-4">
      <JarsoNotice />
      <ChildFields copy={inviteCopy} values={values} onChange={setValues} errors={fieldErrors} />
      <Notice message={error} />
      <Button
        size="lg"
        accessibilityLabel={inviteCopy.submit}
        accessibilityState={{ busy: accept.isPending, disabled: accept.isPending }}
        disabled={accept.isPending}
        onPress={() => void submit()}
      >
        {accept.isPending ? <ActivityIndicator color="white" /> : <Text>{inviteCopy.submit}</Text>}
      </Button>
      <Button variant="outline" size="lg" accessibilityLabel={inviteCopy.notNow} onPress={leave}>
        <Text>{inviteCopy.notNow}</Text>
      </Button>
    </View>
  );
}

/** A pasted link token or code: one lookup for the nickname, then the accept form. */
function LookedUp({ invite }: { invite: string }) {
  const lookup = useInvitationLookup(invite);
  if (lookup.error) {
    if (isAppError(lookup.error) && lookup.error.code === "NOT_FOUND") return <Gone />;
    return <Failed error={lookup.error} onRetry={() => void lookup.refetch()} />;
  }
  if (!lookup.data) return <Waiting />;
  return <AcceptForm invite={invite} nickname={lookup.data.nickname} />;
}

/** An invitation picked from the list. Only opens while it is still addressed to this parent. */
function Listed({ id }: { id: string }) {
  const invitations = useInvitations();
  if (!invitations.data) {
    if (invitations.error) {
      return <Failed error={invitations.error} onRetry={() => void invitations.refetch()} />;
    }
    return <Waiting />;
  }
  const invitation = invitations.data.find((item) => item.id === id);
  if (!invitation) return <Gone />;
  return <AcceptForm invitationId={invitation.id} nickname={invitation.nickname} />;
}

/** Invitations children sent to this parent's email (the web's InvitationList). */
function InvitationList() {
  const router = useRouter();
  const invitations = useInvitations();
  if (!invitations.data) {
    if (invitations.error) {
      return <Failed error={invitations.error} onRetry={() => void invitations.refetch()} />;
    }
    return <Waiting />;
  }
  const items: PendingInvitation[] = invitations.data;
  const now = Date.now();
  const refresh = (
    <Button
      variant="outline"
      accessibilityLabel={`${inviteCopy.refresh} invitations`}
      accessibilityState={{ busy: invitations.isRefetching }}
      onPress={() => void invitations.refetch()}
    >
      <Text>{inviteCopy.refresh}</Text>
    </Button>
  );

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between gap-3">
        <Text accessibilityRole="header" className="font-sans-bold text-h2">
          {inviteCopy.listTitle}
        </Text>
        {items.length > 0 ? refresh : null}
      </View>
      {items.length === 0 ? (
        <Card className="items-center gap-4 py-6">
          <Text className="text-center">{inviteCopy.empty}</Text>
          {refresh}
        </Card>
      ) : (
        <Card className="gap-0 py-1">
          {items.map((invitation, index) => (
            <Fragment key={invitation.id}>
              {index > 0 ? <CardSeparator /> : null}
              <ListRow
                label={invitation.nickname}
                detail={sentAgo(invitation.createdAt, now)}
                trailing={
                  <Text className="font-sans-semibold text-primary">{inviteCopy.accept}</Text>
                }
                accessibilityLabel={`${inviteCopy.accept} ${invitation.nickname}`}
                onPress={() =>
                  router.push({ pathname: "/(parent)/invite", params: { id: invitation.id } })
                }
              />
            </Fragment>
          ))}
        </Card>
      )}
    </View>
  );
}

/** No link: the code the child was shown, then this screen again with `?code=`. */
function CodeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<string[]>();

  const submit = () => {
    const parsed = acceptInvitationSchema.shape.invite.safeParse(code);
    if (!parsed.success) {
      setErrors(parsed.error.issues.map((issue) => issue.message));
      return;
    }
    setErrors(undefined);
    router.push({ pathname: "/(parent)/invite", params: { code: parsed.data } });
  };

  return (
    <Card className="gap-4">
      <Field
        label={inviteCopy.code}
        value={code}
        onChangeText={setCode}
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect={false}
        description={inviteCopy.codeHelp}
        errors={errors}
        onSubmitEditing={submit}
      />
      <Button size="lg" accessibilityLabel={inviteCopy.continue} onPress={submit}>
        <Text>{inviteCopy.continue}</Text>
      </Button>
    </Card>
  );
}

/**
 * Accepting a child's invitation (the web's /invite). One way in per URL, in the web's order:
 * link `token`, then `code`, then an `id` from the parent's own list; none shows the list and
 * the code form. `jarso://invite?code=…` opens it; the `(parent)` gate keeps the query through
 * sign-in and setup.
 */
export function InviteScreen({ params }: { params: InviteRouteParams }) {
  const parsed = inviteParamsSchema.parse(params);
  const token = parsed.token;
  const code = token ? undefined : parsed.code;
  const id = token || code ? undefined : parsed.id;
  const invite = token ?? code;

  return (
    <ScrollView
      className="bg-background"
      contentContainerClassName="gap-4 px-4 pt-2 pb-10"
      keyboardShouldPersistTaps="handled"
    >
      <Text className="text-muted-foreground">{inviteCopy.intro}</Text>
      {invite ? (
        <LookedUp key={invite} invite={invite} />
      ) : id ? (
        <Listed key={id} id={id} />
      ) : (
        <>
          <InvitationList />
          <CodeForm />
        </>
      )}
    </ScrollView>
  );
}
