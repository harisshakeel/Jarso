import { useLocalSearchParams } from "expo-router";
import { InviteScreen } from "@/features/family";

/** Accepting a child's invitation: `?token=`, `?code=` or `?id=`, or none for the list. */
export default function InviteRoute() {
  const params = useLocalSearchParams<{ token?: string; code?: string; id?: string }>();
  return <InviteScreen params={params} />;
}
