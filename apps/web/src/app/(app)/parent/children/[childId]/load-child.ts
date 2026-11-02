import { notFound, redirect } from "next/navigation";
import { routes } from "@/config";
import { getFamilyContext } from "@/features/allowance/server";
import { listChildren, requireRole } from "@/features/family/server";

/** Signed-in parent, one of their children by id, and the family's currency and today. */
export async function loadChild(childId: string, next: string) {
  const { membership } = await requireRole("parent", next);
  if (!membership) redirect(routes.parentSetup);
  const [children, family] = await Promise.all([listChildren(), getFamilyContext()]);
  const child = children.find((c) => c.id === childId);
  if (!child) notFound();
  return { child, ...family };
}
