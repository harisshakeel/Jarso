// The parent's own profile: name and details (ADR 0008). Moved word for word from the web
// components so the phone says the same.

export const profileCopy = {
  /** The "You" part of settings. */
  accountTitle: "Your account",
  detailsTitle: "Your details",
  detailsBody: "Only you can see these.",
  /** The web's theme card. The phone has one Dark mode switch instead. */
  looksTitle: "Looks",
  looksBody: "Light, dark, or follow your device.",
  /** The phone's settings groups: "You" holds the account, notifications and dark mode. */
  youGroup: "You",
  /** The phone's one theme switch (parent Settings and the child's Me). */
  darkMode: "Dark mode",
  darkModeBody: "Switch between light and dark",
  signOutTitle: "Done for now?",
  signOutBody: "Sign out of Jarso on this device.",
  nameSaved: "Name saved",
  name: "Your name",
  saveName: "Save name",
  dateOfBirth: "Date of birth",
  dateOfBirthHelp: "Parents need to be 18 or over.",
  country: "Country",
  countryPlaceholder: "Choose your country",
  countryHelp: "So Jarso shows the right helplines and money for where you live.",
  gender: "Gender",
  genderPlaceholder: "Choose an option",
  genderHelp: 'Helps us see who the pilot reached. "Prefer not to say" is fine.',
  /** The completion dialog over every parent page until the details exist. */
  completeTitle: "One more thing.",
  completeBody: "Tell us a bit about you. Only you can see it, and it never shows to your child.",
  completeSubmit: "Save and continue",
  completeSaved: "Thanks, you're all set",
  /** The same form in settings. */
  detailsSubmit: "Save details",
  detailsSaved: "Details saved",
} as const;
