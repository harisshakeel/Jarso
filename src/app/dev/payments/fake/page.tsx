import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { clientEnv } from "@/config";
import { FakeCheckout, fakeCheckoutParamsSchema } from "@/features/payments";
import { paymentProviderName } from "@/lib/payments";

export const metadata: Metadata = { title: "Fake checkout", robots: { index: false } };

/** Only with the fake provider on; checked per request, after the query, so nothing is prerendered. */
async function FakeCheckoutContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  if (paymentProviderName() !== "fake") notFound();
  const parsed = fakeCheckoutParamsSchema(clientEnv.NEXT_PUBLIC_APP_URL).safeParse(query);
  if (!parsed.success) notFound();
  return <FakeCheckout params={parsed.data} />;
}

/** The fake provider's hosted checkout and save-card page (dev and e2e only). */
export default function FakeCheckoutPage({ searchParams }: PageProps<"/dev/payments/fake">) {
  return (
    <main className="mx-auto grid w-full max-w-lg flex-1 content-center gap-6 px-6 py-10">
      <Suspense fallback={null}>
        <FakeCheckoutContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
