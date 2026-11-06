import {
  type ChestReward,
  type QuestStop,
  type QuestWeek,
  questCopy,
  roadmapCopy,
} from "@jarso/core/learning";
import type { JarsoLook } from "@jarso/core/mascot";
import { BADGES, type BadgeKey } from "@jarso/core/progress";
import { useRouter } from "expo-router";
import {
  CheckIcon,
  GiftIcon,
  LockIcon,
  type LucideIcon,
  MedalIcon,
  PlayIcon,
  RocketIcon,
} from "lucide-react-native";
import { Pressable, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { Jarso } from "@/components/brand";
import { Text } from "@/components/ui";
import { cn, useTokens } from "@/lib";

/** White on a grape fill in both themes, as `keycap-grape` does in button.tsx (`text-white`, spinner `"white"`). */
const ON_GRAPE = "white";
const STOP = 64;
const JARSO = 80;
/** Jarso and his bubble share one column this wide. */
const COLUMN = 96;
const CHEST = 72;
/** Room under the chest for its badge name and wear. */
const CHEST_NOTE = 56;

/** The chest badges' lucide icons; a gift for any other. */
const BADGE_ICONS: Partial<Record<BadgeKey, LucideIcon>> = {
  missions_5: RocketIcon,
  missions_10: MedalIcon,
};

/**
 * The x of Jarso's column centre beside something centred at `anchorX`: on its right, or on its
 * left when the right would run off the map (a stop in a far-right lane, or a narrow phone), so he
 * never stands on the stop.
 */
export function jarsoCenterX(anchorX: number, mapWidth: number, anchorSize = STOP): number {
  const reach = anchorSize / 2 + COLUMN / 2;
  const half = COLUMN / 2;
  const right = anchorX + reach;
  if (right + half <= mapWidth) return right;
  const left = anchorX - reach;
  return Math.max(left, half);
}

/** One week as a winding path of stops with Jarso on today's and a chest at the end. */
export function QuestMap({
  week,
  width: mapWidth,
  reward,
  look,
  fill,
}: {
  week: QuestWeek;
  /** The width the week was laid out for (`questMap`'s `width`). */
  width: number;
  reward: ChestReward;
  look?: JarsoLook;
  fill?: number;
}) {
  const tokens = useTokens();
  const onStop = week.jarso.on === "stop";
  const anchorSize = onStop ? STOP : CHEST;
  const anchorX = onStop
    ? (week.stops.find((s) => s.day === week.jarso.day)?.x ?? week.jarso.x)
    : week.chest.x;
  const jarsoX = jarsoCenterX(anchorX, mapWidth, anchorSize);

  return (
    <View
      accessibilityLabel={questCopy.week(week.week)}
      style={{ width: mapWidth, height: week.height + CHEST_NOTE, alignSelf: "center" }}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ position: "absolute", left: 0, top: 0 }}
      >
        <Svg width={mapWidth} height={week.height}>
          <Path
            d={week.pathD}
            fill="none"
            stroke={tokens["hairline-strong"]}
            strokeWidth={14}
            strokeDasharray="2 22"
            strokeLinecap="round"
          />
        </Svg>
      </View>
      {week.stops.map((stop) => (
        <Stop key={stop.key} stop={stop} />
      ))}
      <Chest week={week} reward={reward} />
      <View
        testID="quest-jarso"
        pointerEvents="none"
        className="items-center"
        style={{
          position: "absolute",
          width: COLUMN,
          left: jarsoX - COLUMN / 2,
          top: week.jarso.y - JARSO / 2 - 36,
        }}
      >
        <View className="rounded-[14px] border-border border-b-[3px] bg-card px-3 py-1">
          <Text className="font-sans-extrabold text-small">
            {week.jarso.day === null ? questCopy.allDone : questCopy.today(week.jarso.day)}
          </Text>
        </View>
        <Jarso mood={onStop ? "wave" : "cheer"} size={JARSO} look={look} fill={fill} />
      </View>
    </View>
  );
}

const wearName = (wear: string) => `${wear.charAt(0).toUpperCase()}${wear.slice(1)}`;

function Stop({ stop }: { stop: QuestStop }) {
  const router = useRouter();
  const tokens = useTokens();
  const reduced = useReducedMotion();
  const now = stop.state === "now";
  const done = stop.state === "done";
  const place = { position: "absolute", left: stop.x - STOP / 2, top: stop.y - STOP / 2 } as const;

  if (!done && !now) {
    return (
      <View
        accessible
        accessibilityLabel={roadmapCopy.locked(roadmapCopy.stopName(stop.day, stop.title))}
        className="size-16 items-center justify-center rounded-full bg-muted"
        style={place}
      >
        <LockIcon size={24} color={tokens["muted-foreground"]} />
      </View>
    );
  }
  return (
    <>
      {now && !reduced ? (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="rounded-full bg-grape-500/20"
          style={{
            position: "absolute",
            left: stop.x - STOP / 2 - 8,
            top: stop.y - STOP / 2 - 8,
            width: STOP + 16,
            height: STOP + 16,
          }}
        />
      ) : null}
      <Pressable
        testID={now ? "quest-stop-now" : undefined}
        accessibilityRole="button"
        accessibilityLabel={
          now
            ? questCopy.playStop(stop.day, stop.title)
            : roadmapCopy.stopName(stop.day, stop.title)
        }
        onPress={() =>
          router.push({
            pathname: "/(child)/learn/[missionKey]",
            params: { missionKey: stop.key },
          })
        }
        className={cn(
          "size-16 items-center justify-center rounded-full",
          done && "bg-primary",
          now && "border-keycap-ledge-grape border-b-[5px] bg-grape-500",
        )}
        style={place}
      >
        {done ? (
          <CheckIcon size={30} color={tokens["primary-foreground"]} />
        ) : (
          <PlayIcon size={28} color={ON_GRAPE} fill={ON_GRAPE} />
        )}
      </Pressable>
    </>
  );
}

function Chest({ week, reward }: { week: QuestWeek; reward: ChestReward }) {
  const tokens = useTokens();
  // `earned` can be true while this week's chest is still shut; only `open` counts here.
  const open = week.chest.open;
  const badge = BADGES[reward.badge];
  const Icon = open ? (BADGE_ICONS[reward.badge] ?? GiftIcon) : GiftIcon;
  return (
    <View
      accessible
      accessibilityLabel={open ? questCopy.chestOpen : questCopy.chestLocked}
      className="items-center"
      style={{
        position: "absolute",
        width: 160,
        left: week.chest.x - 80,
        top: week.chest.y - CHEST / 2,
      }}
    >
      <View
        className={cn(
          "items-center justify-center rounded-[20px] border-gold-600 border-b-[5px] bg-gold",
          !open && "opacity-70",
        )}
        style={{ width: CHEST, height: CHEST }}
      >
        <Icon size={34} color={tokens["gold-foreground"]} />
      </View>
      {open ? (
        <View className="items-center pt-1">
          <Text className="font-sans-bold text-small">{badge.name}</Text>
          {reward.wear === "none" ? null : (
            <Text className="text-muted-foreground text-small">{wearName(reward.wear)}</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}
