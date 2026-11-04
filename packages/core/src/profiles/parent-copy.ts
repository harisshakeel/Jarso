// The parent's own profile: name and details (ADR 0008). Moved word for word from the web
// components so the phone says the same.

export const profileCopy = {
  /** The "You" part of settings. */
  accountTitle: "Your account",
  detailsTitle: "Your details",
  detailsBody: "Only you can see these.",
  looksTitle: "Looks",
  looksBody: "Light, dark, or follow your device.",
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
