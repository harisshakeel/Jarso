import { type DevicePushPrefs, NOTICE_GROUPS, noticeGroupCopy } from "@jarso/core/notifications";
import { useRouter } from "expo-router";
import { Fragment, useState } from "react";
import { ActivityIndicator, Linking, ScrollView, View } from "react-native";
import { Card, CardSeparator, ListRow, ScreenHeader } from "@/components/screen";
import { Button, Switch, Text } from "@/components/ui";
import { useSession } from "@/features/auth";
import { actionErrorMessage, cn, logger } from "@/lib";
import { useDevicePushPrefs } from "./use-device-push-prefs";

const copy = noticeGroupCopy;

type Viewer = "child" | "parent";

/** A labelled switch row, at least 48 dp. A child's labels are card titles (h3). */
function SwitchRow({
  viewer,
  label,
  hint,
  hintClassName,
  value,
  disabled,
  onChange,
}: {
  viewer: Viewer;
  label: string;
  hint?: string;
  hintClassName?: string;
  value: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <View className="min-h-12 flex-row items-center gap-3 py-2">
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className={cn("font-sans-bold", viewer === "child" && "text-h3")}>{label}</Text>
        {hint ? <Text className={cn("text-muted-foreground", hintClassName)}>{hint}</Text> : null}
      </View>
      <Switch
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked: value, disabled }}
        value={value}
        disabled={disabled}
        onValueChange={onChange}
      />
    </View>
  );
}

/**
 * This phone's notification settings, for a child or a parent (mockup L / M / N): "Pause all"
 * and one switch per group. Settings belong to the phone; the inbox / News still gets every
 * notice. A child's quiet hours are fixed, shown as a note. When Android notifications are off it
 * says so and opens the phone's settings; when this phone isn't registered, "Turn on" registers it.
 */
export function NotificationSettings() {
  const { status: session } = useSession();
  const viewer: Viewer = session === "child" ? "child" : "parent";
  const { prefs, status, save, turnOn } = useDevicePushPrefs();
  const [error, setError] = useState<string>();
  const [turningOn, setTurningOn] = useState(false);

  async function change(next: DevicePushPrefs) {
    setError(undefined);
    try {
      await save(next);
    } catch (cause) {
      setError(await actionErrorMessage(cause));
    }
  }

  const toggleGroup = (group: (typeof NOTICE_GROUPS)[number], on: boolean) => {
    if (!prefs) return;
    const others = prefs.mutedGroups.filter((muted) => muted !== group);
    void change({ ...prefs, mutedGroups: on ? others : [...others, group] });
  };

  const openSettings = () =>
    Linking.openSettings().catch(() => logger.warn("Could not open the phone's settings"));

  const onTurnOn = async () => {
    setTurningOn(true);
    try {
      await turnOn();
    } finally {
      setTurningOn(false);
    }
  };

  return (
    <ScrollView className="bg-background" contentContainerClassName="gap-4 px-4 pt-4 pb-10">
      <View className="gap-1">
        <ScreenHeader title={copy.title} />
        {status === "ready" ? (
          <Text className="text-muted-foreground">{copy.thisPhoneOnly}</Text>
        ) : null}
      </View>

      {status === "loading" ? <ActivityIndicator accessibilityLabel="Loading" /> : null}

      {status === "denied" ? (
        <Card>
          <Text className="font-sans-bold">{copy.permissionOff.title}</Text>
          <Text className="text-muted-foreground">{copy.permissionOff.body}</Text>
          <Button
            accessibilityLabel={copy.permissionOff.action}
            onPress={() => void openSettings()}
          >
            <Text>{copy.permissionOff.action}</Text>
          </Button>
        </Card>
      ) : null}

      {status === "no-token" ? (
        <Card>
          <Text className="font-sans-bold">{copy.notOn.title}</Text>
          <Button
            accessibilityLabel={copy.notOn.action}
            accessibilityState={{ busy: turningOn, disabled: turningOn }}
            disabled={turningOn}
            onPress={() => void onTurnOn()}
          >
            {turningOn ? <ActivityIndicator /> : <Text>{copy.notOn.action}</Text>}
          </Button>
        </Card>
      ) : null}

      {status === "ready" && prefs ? (
        <>
          <Card>
            <SwitchRow
              viewer={viewer}
              label={copy.pause.label}
              hint={copy.pause.hint}
              value={prefs.paused}
              onChange={(paused) => void change({ ...prefs, paused })}
            />
          </Card>
          <Card className={cn("gap-0 py-1", prefs.paused && "opacity-60")}>
            {NOTICE_GROUPS.map((group, index) => (
              <Fragment key={group}>
                {index > 0 ? <CardSeparator /> : null}
                <SwitchRow
                  viewer={viewer}
                  label={copy.groups[group].label}
                  // The child's page lists the groups by name only (mockup M).
                  hint={viewer === "parent" ? copy.groups[group].hint : undefined}
                  hintClassName="text-small"
                  value={!prefs.mutedGroups.includes(group)}
                  disabled={prefs.paused}
                  onChange={(on) => toggleGroup(group, on)}
                />
              </Fragment>
            ))}
          </Card>
          {error ? (
            <Text accessibilityRole="alert" className="text-destructive">
              {error}
            </Text>
          ) : null}
        </>
      ) : null}

      {viewer === "child" ? (
        <View className="rounded-2xl bg-secondary px-3 py-2.5">
          <Text className="font-sans-bold">{copy.quietHours.label}</Text>
          <Text>{copy.quietHours.hint}</Text>
        </View>
      ) : null}

      <Text className="text-small text-muted-foreground">
        {viewer === "child" ? copy.newsStillShows : copy.inboxStillShows}
      </Text>
    </ScrollView>
  );
}

/** The "Notifications" row with a chevron in Settings (parent) and Me (child) (mockup J). */
export function NotificationsRow() {
  const { status } = useSession();
  const router = useRouter();
  if (status !== "child" && status !== "parent") return null;
  return (
    <Card className="py-1">
      <ListRow label={copy.title} onPress={() => router.push(`/(${status})/notifications`)} />
    </Card>
  );
}
