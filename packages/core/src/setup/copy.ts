// The parent's onboarding on the phone. Parent-facing: calm and short; headings up to 6 words,
// button labels up to 3. Nothing here ever shows a PIN.

/** Names offered for "Your child calls you"; "Other…" takes a typed one. */
export const CHILD_CALLS_YOU = ["Mum", "Dad", "Mama", "Papa"] as const;

export const setupFlowCopy = {
  stepLabel: (n: number, total: number) => `Step ${n} of ${total}`,
  next: "Next",
  skip: "Skip",
  back: "Back",
  /** Under the parent's sign-in form. */
  newHere: "New to Jarso?",
  createAccount: "Create an account",
  welcome: {
    title: "Pocket money kids get good at",
    parent: "I'm a parent",
    child: "I'm a kid",
    haveAccount: "I have an account",
    signIn: "Sign in",
  },
  how: {
    cards: [
      {
        key: "jars",
        title: "Two jars",
        body: "Your child carries Spend. You keep Save safe. Jarso keeps count of both.",
        note: "No bank card needed. Real cash, tracked.",
      },
      {
        key: "ask",
        title: "They ask, you hand over",
        body: "Saving some or using savings comes to you. Say yes, then hand over the cash.",
        note: "You choose how much freedom they get.",
      },
      {
        key: "mission",
        title: "A mission a day",
        body: "Three minutes of play teaches one money idea. Jarso cheers them on.",
        note: "No ads. Nothing to buy.",
      },
    ],
    cardLabel: (n: number, total: number) => `Card ${n} of ${total}`,
  },
  account: {
    title: "Create your account",
    email: "Email",
    password: "Password",
    passwordHelp: "8 or more characters",
    name: "Your name",
    submit: "Continue",
    note: "We check your email next. Kids never give us theirs.",
    haveAccount: "Already have an account?",
    signIn: "Sign in",
    /** The web's sign-up line: the same for every refusal, so no address can be probed. */
    refused: "We couldn't create your account. Check your details and try again.",
  },
  verify: {
    title: "Check your email",
    sent: (email: string) => `We sent a code to ${email}.`,
    hint: "It can take a minute. Look in spam too.",
    code: "Code from the email",
    submit: "Confirm",
    resend: "Send again",
    wait: (seconds: number) => `Send again in ${seconds} s`,
    resent: "A new code is on its way.",
    noMatch: "That code didn't match. Check it, or send a new one.",
    slowDown: "Please wait a minute, then send a new code.",
    otherEmail: "Use another email",
    confirmed: "Already confirmed?",
  },
  about: {
    title: "About you",
    callsYou: "Your child calls you",
    callsYouHelp: "Child screens use it, like “Hand the cash to Mum”.",
    other: "Other…",
    otherLabel: "What they call you",
  },
  child: {
    title: "Add your child",
    nickname: "Nickname they use",
    nicknameHelp: "They type it to sign in.",
    pin: "Pick a PIN",
    pinHelp: "4 to 6 numbers. Only you and your child know it.",
    promiseTitle: "Only a nickname",
    promise: "No email, surname or birthday.",
    submit: (nickname: string) => (nickname.trim() ? `Add ${nickname.trim()}` : "Add child"),
    later: "Later",
    moreLater: "You can add another child later.",
  },
  money: {
    title: (nickname: string) => `${nickname}'s pocket money`,
    intro: "How much, how often and from when. You hand over the cash.",
    notNow: "Not now",
  },
  freedom: {
    title: "How much freedom?",
    question: (nickname: string) => `When ${nickname} saves or uses savings`,
    options: {
      ask: { label: "Ask me every time", hint: "Best to start" },
      small: {
        label: "Small ones: just tell me",
        hint: (amount: string) => `Under ${amount} goes through`,
      },
      free: { label: (nickname: string) => `${nickname} decides`, hint: "You get a note" },
    },
    later: (nickname: string) => `Change any time in ${nickname}'s rules.`,
    submit: "Next",
  },
  share: {
    title: (nickname: string) => `${nickname}'s ready!`,
    signsInWith: (nickname: string) => `${nickname} signs in with`,
    familyCode: "Family code",
    nickname: "Nickname",
    pin: "PIN",
    pinValue: "The one you picked",
    scan: (nickname: string) => `Scan this with Jarso on ${nickname}'s phone.`,
    qrLabel: (nickname: string) => `Sign-in code for ${nickname}`,
    send: "Share details",
    done: "Go to family",
    /** The share sheet's text. The PIN stays with the parent and child. */
    message: ({
      familyCode,
      nickname,
      link,
    }: {
      familyCode: string;
      nickname: string;
      link: string;
    }) =>
      `Sign in to Jarso\nFamily code: ${familyCode}\nNickname: ${nickname}\nPIN: the one we picked\n${link}`,
  },
} as const;
