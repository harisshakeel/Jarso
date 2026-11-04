import type { FailureCode, SavedCard } from "./types";

/** Parent-facing copy for card payments. The child never sees any of it. */
export const paymentCopy = {
  off: "Card payments aren't turned on.",
  fullAmount: "Card pays the full amount",
  tooSmall: "Too small to pay by card",
  unsupportedCurrency: "Card payments don't work in your family's currency yet.",
  notDue: "This isn't due any more, so there's nothing to pay.",
  giftNotDue: "This gift isn't due yet.",
  inProgress: "A card payment is already in progress. Give it a minute and try again.",
  badReturn: "Something went wrong. Please try again.",
  nothingToCharge: "There's nothing left to charge for this.",
  chooseProvider: "Choose which card to charge.",
  allowanceFor: (nickname: string) => `Allowance for ${nickname}`,
  giftFor: (nickname: string) => `Gift for ${nickname}`,
  mandate:
    "Jarso will charge this card the allowance or gift amount on the day it's due, until you turn auto charge off.",
  returned: "Payment received, updating the jars…",
  received: "Payment received.",
  unapplied:
    "Paid by card after it was already handed over. Refund it from the provider's dashboard.",
  payByCard: "Pay by card",
  payWith: (label: string) => `Pay with ${label}`,
  pendingTitle: "Card payment in progress",
  pendingDetail: "You can still hand it over in cash.",
  failedTitle: "Card payment didn't go through",
  failedDetail: "Try the card again or hand it over in cash.",
  autoCharge: "Auto charge",
  autoChargeAllowance: "Pay each allowance by card on the day it's due.",
  autoChargeGift: "Pay this gift by card on the day it's due.",
  autoChargeLater: "Once it's saved, you can turn on auto charge for it.",
  autoChargeOverdue:
    "This gift's day has passed, so auto charge can't pay it. Hand it over instead.",
  saveCardTitle: "Save a card first",
  saveCard: "Save a card",
  saveWith: (label: string) => `Save with ${label}`,
  chooseCardTitle: "Which card should pay?",
  chooseCardDetail: "Auto charge uses this card on the day it's due.",
  cardAt: (card: string, label: string) => `${card}, ${label}`,
  charges: (card: string) => `Charges ${card}.`,
  chargesOther: (label: string) => `Charges a card saved with ${label}.`,
  /** Singular only for exactly one saved card; providers listed with no card don't count. */
  savedCardTitle: (cards: readonly SavedCard[]) =>
    cards.filter((entry) => entry.card !== null).length === 1 ? "Saved card" : "Saved cards",
  notNow: "Not now",
  contactTitle: (label: string) => `Save a card with ${label}`,
  phoneHelp: (label: string) =>
    `${label} needs your mobile number to save a card. Jarso doesn't keep it.`,
  phoneLabel: "Mobile number",
  phoneRequired: "Enter your mobile number.",
  phoneInvalid: "Enter a mobile number with 8 to 15 digits. You can start it with +.",
  noAccountEmail: (label: string) => `Add an email to your account to save a card with ${label}.`,
  continueToSave: "Continue",
  noCard: "No card saved. Turn on auto charge for an allowance or gift to save one.",
  removeCard: "Remove card",
  removeTitle: "Remove this card?",
  removeDetail:
    "Auto charge turns off everywhere it uses this card. You can still pay by card when you hand over.",
  removed: "Card removed.",
  testMode: "Test mode. No real money moves.",
  saveCardOpening: "The secure card form opens over this page. Saving a card charges ₹1.",
  openCardForm: "Open the card form",
  cardFormFailed: "The card form didn't load. Check your connection and try again.",
  goBack: "Go back",
  cardEnding: (brand: string, last4: string) =>
    `${brand.charAt(0).toUpperCase()}${brand.slice(1)} ending ${last4}`,
  // The phone's native card sheet.
  confirming: "Checking the payment…",
  stillConfirming: "Still confirming with the bank. The jars update as soon as it's through.",
  payAgain: "Pay again",
  cancelPayment: "Cancel card payment",
  cancelled: "Card payment cancelled.",
  fakeTitle: "Test card (dev build)",
  fakeDetail: "No card is charged. Pick what the card does.",
  fakePay: "Pay",
  fakeDecline: "Decline",
  fakeSaveOk: "Save a card that works",
  fakeSaveDecline: "Save a card that declines",
  /** The card block's title on the phone's handover screen, under the cash split. */
  orPayByCard: "Or pay by card",
  /** The phone's saved-card row and its confirm: "Remove" beside the card, "Keep it" to back out. */
  remove: "Remove",
  keepCard: "Keep it",
} as const;

/** Plain words for why a card didn't go through. */
export const failureCopy: Record<FailureCode, string> = {
  declined: "The card was declined.",
  insufficient_funds: "The card didn't have enough money.",
  authentication_required: "The bank asked for a check, so the card wasn't charged.",
  expired_card: "The card has expired.",
  other: "The card payment didn't go through.",
};
