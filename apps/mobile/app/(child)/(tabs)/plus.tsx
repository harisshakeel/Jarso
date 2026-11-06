import { Redirect } from "expo-router";

/** The + button never selects this tab (it opens `/(child)/add`); a deep link lands there too. */
export default function PlusTab() {
  return <Redirect href="/(child)/add" />;
}
