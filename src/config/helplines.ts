// Helplines the guide shows with a safety response (FR09, spec §5.2). The pilot runs in the UK
// and the US; everywhere else gets the international directory. Checked on 2026-10-30 against
// the services' own pages: re-check before each release, and keep entries free to call.

export type Helpline = { name: string; contact: string; url: string };

const UK: Helpline[] = [
  {
    name: "Childline",
    contact: "Call 0800 1111, free, any time",
    url: "https://www.childline.org.uk",
  },
];

const US: Helpline[] = [
  {
    name: "988 Suicide & Crisis Lifeline",
    contact: "Call or text 988, any time",
    url: "https://988lifeline.org",
  },
  {
    name: "Childhelp National Child Abuse Hotline",
    contact: "Call or text 1-800-422-4453, any time",
    url: "https://www.childhelp.org",
  },
];

export const helplineDirectory: Helpline = {
  name: "Find A Helpline",
  contact: "Free, confidential support in your country",
  url: "https://findahelpline.com",
};

/**
 * Helplines for a family. Keyed by the family currency, which every child session can read,
 * so a child's request never needs a parent's private details (ADR 0008).
 */
export function helplinesFor(currency: string): Helpline[] {
  if (currency === "GBP") return [...UK, helplineDirectory];
  if (currency === "USD") return [...US, helplineDirectory];
  return [helplineDirectory];
}
