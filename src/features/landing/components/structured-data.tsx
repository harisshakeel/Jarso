import { clientEnv, siteConfig } from "@/config";

/**
 * schema.org JSON-LD for search engines and AI crawlers (Next.js JSON-LD guide): who publishes
 * Jarso, the site, and the web app with its age range.
 */
export function StructuredData() {
  const home = new URL("/", clientEnv.NEXT_PUBLIC_APP_URL).href;
  const organization = `${home}#organization`;
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": organization,
        name: siteConfig.name,
        url: home,
        logo: new URL("/brand/icons/jarso-mark-512.png", home).href,
      },
      {
        "@type": "WebSite",
        "@id": `${home}#website`,
        name: siteConfig.name,
        url: home,
        description: siteConfig.description,
        inLanguage: "en-GB",
        publisher: { "@id": organization },
      },
      {
        "@type": "WebApplication",
        "@id": `${home}#app`,
        name: siteConfig.name,
        url: home,
        description: siteConfig.description,
        applicationCategory: "EducationalApplication",
        operatingSystem: "Any",
        browserRequirements: "Requires JavaScript and a modern browser",
        audience: { "@type": "PeopleAudience", suggestedMinAge: 11, suggestedMaxAge: 14 },
        publisher: { "@id": organization },
      },
    ],
  };
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD must be raw JSON; the data is static and "<" is escaped.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
