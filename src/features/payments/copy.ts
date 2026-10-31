import type { FailureCode } from "./types";

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
  allowanceFor: (nickname: string) => `Allowance for ${nickname}`,
  giftFor: (nickname: string) => `Gift for ${nickname}`,
  mandate:
    "Jarso will charge this card the allowance or gift amount on the day it's due, until you turn auto charge off.",
  returned: "Payment received, updating the jars…",
  received: "Payment received.",
  unapplied:
    "Paid by card after it was already handed over. Refund it from the provider's dashboard.",
  payByCard: "Pay by card",
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
  notNow: "Not now",
  noCard: "No card saved. Turn on auto charge for an allowance or gift to save one.",
  removeCard: "Remove card",
  removeTitle: "Remove this card?",
  removeDetail:
    "Auto charge turns off everywhere you turned it on. You can still pay by card when you hand over.",
  removed: "Card removed.",
  testMode: "Test mode. No real money moves.",
  cardEnding: (brand: string, last4: string) =>
    `${brand.charAt(0).toUpperCase()}${brand.slice(1)} ending ${last4}`,
} as const;

/** Plain words for why a card didn't go through. */
export const failureCopy: Record<FailureCode, string> = {
  declined: "The card was declined.",
  insufficient_funds: "The card didn't have enough money.",
  authentication_required: "The bank asked for a check, so the card wasn't charged.",
  expired_card: "The card has expired.",
  other: "The card payment didn't go through.",
};
