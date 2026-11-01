import type { Metadata } from "next";
import { sharedOpenGraph, siteConfig } from "@/config";
import {
  FamilyView,
  GuideSection,
  Hero,
  HowItWorks,
  LandingFooter,
  LandingHeader,
  LitStatement,
  landingCopy,
  StructuredData,
  YourTurn,
} from "@/features/landing";

export const metadata: Metadata = {
  title: { absolute: landingCopy.meta.title },
  description: siteConfig.description,
  alternates: { canonical: "/" },
  openGraph: {
    ...sharedOpenGraph,
    title: landingCopy.meta.title,
    description: siteConfig.description,
    url: "/",
  },
};

/** The landing page (spec 2026-10-30-landing-page-design). Static: nothing here reads the session. */
export default function HomePage() {
  return (
    <>
      <StructuredData />
      <LandingHeader />
      <main className="flex flex-1 flex-col overflow-x-clip">
        <Hero />
        <HowItWorks />
        {/* The jar's outline travels down the left margin here (jar-thread.tsx). The sections
            keep their own 1rem gutter; when the thread is thicker than that (wide screens), the
            words move over by the difference. Unset with reduced motion. */}
        <div className="pl-[max(0px,calc(var(--thread-width,0px)-0.5rem))]">
          <GuideSection />
          <FamilyView />
          <LitStatement />
          <YourTurn />
        </div>
      </main>
      <LandingFooter />
    </>
  );
}
