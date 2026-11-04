// Intl polyfills for Hermes. Core's money, describe and sent-ago helpers need Intl.PluralRules,
// Intl.RelativeTimeFormat and NumberFormat#formatToParts, which Hermes lacks (formatToParts on
// iOS only); PluralRules' polyfill needs Intl.Locale. The parent's country picker names regions
// with Intl.DisplayNames, which Hermes also lacks. Each `polyfill` entry installs itself only
// when the engine falls short, and locale data only loads into a polyfilled constructor.
// Must be the first import of app/_layout.tsx (and of the jest setup).
import "@formatjs/intl-locale/polyfill.js";
import "@formatjs/intl-pluralrules/polyfill.js";
import "@formatjs/intl-pluralrules/locale-data/en.js";
import "@formatjs/intl-relativetimeformat/polyfill.js";
import "@formatjs/intl-relativetimeformat/locale-data/en.js";
import "@formatjs/intl-displaynames/polyfill.js";
import "@formatjs/intl-displaynames/locale-data/en.js";
import { shouldPolyfill as numberFormatNeedsPolyfill } from "@formatjs/intl-numberformat/should-polyfill.js";

// formatMoney and parseMoney's symbol table use these locales (core/lib/money.ts).
if (numberFormatNeedsPolyfill() || !("formatToParts" in Intl.NumberFormat.prototype)) {
  require("@formatjs/intl-numberformat/polyfill-force.js");
  require("@formatjs/intl-numberformat/locale-data/en.js");
  require("@formatjs/intl-numberformat/locale-data/en-GB.js");
  require("@formatjs/intl-numberformat/locale-data/en-IN.js");
  require("@formatjs/intl-numberformat/locale-data/en-AU.js");
  require("@formatjs/intl-numberformat/locale-data/en-CA.js");
  require("@formatjs/intl-numberformat/locale-data/ja.js");
}
