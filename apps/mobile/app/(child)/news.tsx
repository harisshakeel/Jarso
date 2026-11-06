import { NewsScreen } from "@/features/news";

/** The child's inbox, pushed over the tabs (Home's bell opens it). */
export default function ChildNews() {
  return <NewsScreen viewer="child" />;
}
