// Jest runs on Node, whose Intl is complete. Remove what Hermes lacks (hermes doc/IntlAPIs.md:
// no Intl.Locale, PluralRules or RelativeTimeFormat; no NumberFormat#formatToParts on iOS) so
// the intl test proves the app's polyfills fill those gaps, as they must on a phone.
const intl = Intl as unknown as Record<string, unknown>;
delete intl.Locale;
delete intl.PluralRules;
delete intl.RelativeTimeFormat;
delete (Intl.NumberFormat.prototype as unknown as Record<string, unknown>).formatToParts;
