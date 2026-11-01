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
        {/* The jar's outline travels down the left margin here (jar-thread.tsx): keep the words
            clear of it at every width. The variable is unset with reduced motion. */}
        <div className="pl-[calc(var(--thread-width,0px)+0.5rem)]">
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
