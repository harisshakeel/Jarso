import { parentPageCopy } from "@jarso/core/dashboard";
import { TabHeading } from "@/components/screen";

/** Family. Placeholder so the route resolves; Task 4 builds the family home. */
export default function FamilyTab() {
  return <TabHeading title={parentPageCopy.family} />;
}
