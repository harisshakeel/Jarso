/** The child sign-in screen's words, shared by the web page and the phone. */
export const childSignInCopy = {
  heading: "Welcome back. Let's sign in.",
  subline: "Use your family code, your nickname and your PIN.",
  familyCodeHint: "Your parent can find it in their Settings.",
} as const;

/** The phone's QR scan and PIN pad on the child's sign-in. Child-facing: short and kind. */
export const childScanCopy = {
  scan: "Scan the code",
  scanHint: "Your parent has it on their phone.",
  point: "Point at the code on your parent's phone",
  notJarso: "That's not a Jarso code. Try another!",
  noCamera: "No camera? Type the code instead.",
  close: "Close",
  filled: "Got it! Now tap your PIN.",
  pin: "Your PIN",
  pinTyped: (n: number) => (n === 1 ? "1 number typed" : `${n} numbers typed`),
  delete: "Delete",
} as const;
