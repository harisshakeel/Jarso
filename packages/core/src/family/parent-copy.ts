// Parent screens for the family. Moved word for word from the web components so the phone says
// the same. Functions take values already formatted by the caller.

/** Shown on the nickname field when another child in the family has it. */
export const nicknameTaken = "Another child in your family already uses this nickname";

/** Setting up the family: currency and time zone. */
export const setupCopy = {
  eyebrow: "Getting started",
  title: "Set up your family.",
  intro: "Pick the currency your family uses. You can add your children next.",
  currency: "Currency",
  currencyHelp: "Pocket money, savings and goals all use this currency.",
  timezone: "Time zone",
  findingTimezone: "Finding your time zone…",
  timezoneHelp: "Taken from this device, so allowance days line up with your week.",
  create: "Create family",
} as const;

/** The nickname, PIN and consent fields shared by adding a child and accepting an invitation. */
const childFields = {
  nickname: "Nickname",
  pin: "PIN",
  pinHelp: "4 to 6 numbers. Your child uses it with the family code to sign in.",
  consent: "I am this child's parent or guardian",
  submit: "Add child",
} as const;

/** Adding a child. */
export const addChildCopy = {
  ...childFields,
  eyebrow: "Your family",
  title: "Add a child.",
  intro:
    "Choose a nickname and a PIN. Your child signs in with these and your family code, which is in Settings.",
  nicknameHelp: "What your child likes to be called. They type it to sign in.",
  cancel: "Cancel",
} as const;

/** Accepting an invitation a child sent, and the list of them. */
export const inviteCopy = {
  ...childFields,
  eyebrow: "Invitation",
  title: "Your child asked to join.",
  intro: "Check their nickname and choose a PIN. They sign in with these and your family code.",
  nicknameHelp: "Your child picked this. You can change it. They type it to sign in.",
  notNow: "Not now",
  listTitle: "Waiting for you",
  empty: "No invitations waiting. If your child just sent one, refresh.",
  accept: "Accept",
} as const;

/** Family settings: the code, each child's account, the timezone, and the first-child card. */
export const familySettingsCopy = {
  familyTitle: "Family",
  familyBody: (currency: string) =>
    `Money is kept in ${currency}. That can't change once the family exists.`,
  acceptChildInvitation: "Accept a child's invitation",
  childrenTitle: "Children",
  childrenBody: "Rename, reset a PIN, or remove a child from your family.",
  codeCopied: "Family code copied",
  codeCopyFailed: "Couldn't copy. You can type the code instead.",
  codeEyebrow: "Family code",
  codeTitle: "Give this code to your child",
  codeBody: "They sign in with this code, their nickname and their PIN.",
  copyCode: "Copy code",
  noChildren: "No children yet.",
  addChild: "Add a child",
  rename: "Rename",
  renameTitle: (nickname: string) => `New nickname for ${nickname}`,
  renameBody: (nickname: string) =>
    `${nickname} signs in with their nickname, so tell them the new one.`,
  renamed: "Nickname updated",
  nickname: "Nickname",
  nicknameHelp: "Up to 20 letters, numbers, spaces, dots, dashes or apostrophes.",
  saveNickname: "Save nickname",
  resetPin: "Reset PIN",
  resetPinFor: (nickname: string) => ` for ${nickname}`,
  pinTitle: (nickname: string) => `New PIN for ${nickname}`,
  pinBody: (nickname: string) =>
    `The old PIN stops working straight away. Tell ${nickname} the new one.`,
  pinUpdated: (nickname: string) => `PIN updated for ${nickname}`,
  newPin: "New PIN",
  pinHelp: "4 to 6 numbers.",
  savePin: "Save PIN",
  removed: (nickname: string) => `${nickname} was removed from your family`,
  remove: "Remove",
  removeTitle: (nickname: string) => `Remove ${nickname} from your family?`,
  removeBody: (nickname: string) =>
    `${nickname} will be signed out on every device and their PIN will stop working. Their account is deleted. You can add ${nickname} again later with a new PIN. This can't be undone.`,
  keepChild: (nickname: string) => `Keep ${nickname}`,
  removeChild: (nickname: string) => `Remove ${nickname}`,
  saved: "Family settings saved",
  timezone: "Timezone",
  timezoneHelp: "Allowance due dates and reminders follow this timezone.",
  save: "Save",
  firstChild: "Add your first child to get started.",
  acceptInvitation: "Accept an invitation",
} as const;
