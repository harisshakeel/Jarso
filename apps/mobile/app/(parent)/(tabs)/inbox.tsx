import { NewsScreen } from "@/features/news";

/** The parent's inbox: the shared inbox in the parent's wording. */
export default function ParentInbox() {
  return <NewsScreen viewer="parent" />;
}
