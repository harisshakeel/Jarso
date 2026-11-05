// Jarso's fixed text (spec §5.2 step 7, ADR 0011): what the app shows instead of a model reply,
// and the labels around it. Child-facing: reading age about 10, warm, no blame, no exclamation
// marks. Change only through a PR review.

/** A starter question on an empty chat: the question (the button's name) and a hint under it. */
export type SuggestionCard = {
  key: "jars" | "spent" | "allowance" | "saving" | "goal" | "learning";
  question: string;
  hint: string;
};

const childCards: SuggestionCard[] = [
  { key: "jars", question: "How much do I have?", hint: "Spend and Save, right now" },
  { key: "spent", question: "What did I spend this week?", hint: "Where your money went" },
  { key: "allowance", question: "When is my next allowance?", hint: "Your next payday" },
  { key: "saving", question: "How long to save for something?", hint: "A plan to get there" },
  { key: "goal", question: "How long until my goal?", hint: "Your goal, step by step" },
  { key: "learning", question: "What should I learn next?", hint: "Your next mission" },
];

const parentCards = (nickname: string): SuggestionCard[] => [
  { key: "saving", question: `How is ${nickname} doing with saving?`, hint: "Save jar and goal" },
  {
    key: "spent",
    question: `What did ${nickname} spend on this week?`,
    hint: "This week's purchases",
  },
  { key: "allowance", question: `When is ${nickname}'s next allowance?`, hint: "The next payday" },
  {
    key: "learning",
    question: `What has ${nickname} learned so far?`,
    hint: "Missions and skills",
  },
];

export const guideCopy = {
  name: "Jarso",
  label: "Jarso AI",
  disclosure: "Jarso is an AI. Your parent can see these chats.",
  intro: [
    "I'm Jarso, the app's AI helper. I'm a computer program, not a person, and I can get things wrong.",
    "When you ask, I can look at your jars, allowance, money history and learning to help you. Only yours, and only when you ask.",
    "Your parent can see our chats.",
    "Please don't share personal details like your full name, address, school or phone number.",
  ],
  introButton: "Got it",
  placeholder: "Ask Jarso about money…",
  homePlaceholder: "Ask Jarso about your money…",
  homeTitle: "Ask Jarso",
  /** The floating Jarso opened during a lesson: it talks about the question on screen. */
  lesson: {
    title: "Ask about this question",
    placeholder: "Ask Jarso about this question…",
    greeting: "Stuck? Ask me about this question.",
    hello: "Stuck? Ask me!",
    suggestions: ["Can you give me a hint?", "What is this question asking?"],
    whySuggestions: ["Why is that the answer?", "Can you explain it another way?"],
    /** Asked for the child the moment "Help me" or "Why?" opens, so Jarso starts answering. */
    helpOpener: "Can you give me a hint?",
    whyOpener: "Why is that the answer?",
  },
  /** The greeting over an empty chat on the Jarso page, naming who is asking. */
  greeting: {
    child: (nickname: string) =>
      nickname ? `Hi ${nickname}. Ask me about your money.` : "Ask me about your money.",
    parent: (firstName: string, nickname: string) =>
      firstName
        ? `Hi ${firstName}. Ask me anything about ${nickname}'s money.`
        : `Ask me anything about ${nickname}'s money.`,
  },
  /** Starter questions as cards with a hint each (the Jarso page). */
  suggestionCards: { child: childCards, parent: parentCards },
  suggestions: {
    jars: "How much do I have?",
    spent: "What did I spend this week?",
    allowance: "When is my next allowance?",
    saving: "How long to save for something?",
    goal: "How long until my goal?",
    learning: "What should I learn next?",
  },
  thinking: "Thinking…",
  /**
   * What Jarso is doing right now, streamed while it works. Each line is true of the step it
   * names: the phases come from the pipeline, the look-ups from the tool that is running.
   */
  phases: {
    reading: "Reading your question…",
    answering: "Putting an answer together…",
    checking: "Double-checking the answer…",
  },
  /**
   * One line per look-up while Jarso works (by tool name). Said so it fits a child asking about
   * their own money and a parent asking about their child's.
   */
  status: {
    get_jars: "Peeking in the jars…",
    get_allowance: "Checking when pocket money comes…",
    get_money_history: "Flipping through the money history…",
    get_money_rules: "Checking the money rules…",
    get_learning: "Looking at the learning so far…",
    plan_saving: "Working out a saving plan…",
    get_goal: "Checking the goal…",
    get_requests: "Checking the requests…",
    remember: "Making a note of that…",
    propose_goal: "Working out a goal…",
    propose_action: "Getting that ready for you to check…",
  },
  /**
   * Funny lines that follow the line above while that step is still going, one every couple of
   * seconds, keyed like `phases` and `status`. Each is about the step it follows; none judges an
   * amount (FR09).
   */
  quips: {
    reading: ["Reading it twice, just to be sure…", "Ooh, good question…"],
    answering: [
      "Choosing my words like coins…",
      "Keeping it short and sweet…",
      "Polishing the answer till it shines…",
    ],
    checking: ["Counting the coins twice…", "Making sure every number adds up…", "One last look…"],
    get_jars: [
      "Lifting the lids…",
      "Counting coins (no biting them)…",
      "Giving the jars a gentle shake…",
    ],
    get_allowance: ["Looking at the calendar…", "Counting the sleeps till pocket money…"],
    get_money_history: ["Following the trail of coins…", "Reading the receipts…"],
    get_money_rules: ["Reading the small print…", "Checking what's allowed…"],
    get_learning: ["Counting the gold stars…", "Checking the missions…"],
    plan_saving: [
      "Doing the maths, carefully…",
      "Counting on my fingers (I don't have fingers)…",
      "Stacking coins in my head…",
    ],
    get_goal: ["Measuring how close the goal is…", "Climbing the coin staircase…"],
    get_requests: ["Looking through the asks…"],
    remember: ["Writing it on a sticky note…"],
    propose_goal: ["Drawing the coin staircase…", "Counting the steps to the top…"],
    propose_action: [
      "Filling in the form for you…",
      "Lining up the coins neatly…",
      "Nothing happens till you tap…",
    ],
  } as Record<string, readonly string[]>,
  /** After a step's own lines run out, so a long think never looks stuck. */
  stillWorking: ["Still thinking…", "My lid is spinning…", "Nearly there…"],
  /** The four steps of a reply, lit in turn under Jarso's eyes while it works. */
  steps: ["Reading", "Looking things up", "Writing", "Checking"],
  /** The past chats, behind one "History" control on the Jarso page. */
  history: {
    button: "History",
    title: "Your chats",
    empty: "No chats yet.",
    groups: { today: "Today", week: "This week", earlier: "Earlier" },
  },
  /** Speaking a question instead of typing it (the browser's own speech recognition). */
  voice: {
    label: "Speak your question",
    listening: "Listening…",
    failed: "Couldn't hear that. Type it instead.",
  },
  /** What the parent sees Jarso looked at, per reply (by tool name). */
  checked: {
    get_jars: "jars",
    get_allowance: "allowance",
    get_money_history: "money history",
    get_money_rules: "money rules",
    get_learning: "learning",
    plan_saving: "saving plan",
    get_goal: "goal",
    get_requests: "requests",
    remember: "memory",
    propose_goal: "goal idea",
    propose_action: "prepared an action",
  },
  /**
   * The card under a reply in which Jarso prepared an action. Jarso never does it: the user's
   * tap runs the app's own form for it, and the outcome line comes from what that returned.
   */
  action: {
    eyebrow: "Check this, then tap Do it",
    doIt: "Do it",
    change: "Change something",
    /** Put in the box by "Change something", for the user to finish. */
    changePrompt: "Change it: ",
    already: "That's already been sent.",
  },
  /** The card under a reply that offered a goal. The child decides; Jarso never sets one. */
  proposal: {
    title: "Make it your goal?",
    make: "Make it my goal",
    notNow: "Not now",
    saved: "That's your goal now. You can see it from your Save jar.",
    planLeftOff:
      "That's your goal now. The amount to save each time was more than your allowance, so set it on your goal page.",
    hasGoal: (name: string) => `You already have a goal: ${name}. Swap it for this one?`,
    replace: "Swap it",
    keep: "Keep my goal",
    see: "See my goal",
  },
  /** The photo price check: a price tag or receipt read into a question for Jarso. */
  photo: {
    button: "Snap a price",
    hint: "Take a photo of a price tag or receipt.",
    reading: "Reading the price…",
    none: "I couldn't find a price in that photo. Try a clearer one, or type the price.",
    otherCurrency:
      "That price looks like it's in a different money. Type the price in yours instead.",
    untitled: "Something I want",
    tooBig: "That photo is too big. Try another one.",
    notPhoto: "Choose a photo (JPEG, PNG or WebP).",
  },
  /** Under a reply that kept a fact, so the child always knows what Jarso remembers. */
  remembered: "Jarso will remember:",
  memories: {
    title: "What Jarso remembers",
    /** The row in the phone's Me that opens the list. */
    count: (notes: number) => (notes === 1 ? "1 note" : `${notes} notes`),
    intro: "Short notes Jarso keeps so it can pick up where you left off. Delete any you like.",
    empty:
      "Nothing yet. When you tell Jarso what you like or what you're saving for, it can remember.",
    forget: "Forget",
    /** Asked before Forget, since it can't be undone. */
    forgetTitle: "Forget this?",
    forgetBody: (text: string) => `Jarso won't remember "${text}" any more.`,
    keep: "Keep it",
    kinds: {
      interest: "Likes",
      thinking_about: "Thinking about",
      finds_tricky: "Finds tricky",
      prefers: "Prefers",
    },
  },
  /** The parent's window on their Home: the same Jarso, asking about one child. */
  parent: {
    title: (nickname: string) => `Ask Jarso about ${nickname}`,
    disclosure: (nickname: string) =>
      `Jarso is an AI. It looks at ${nickname}'s jars and learning only when you ask. ${nickname} doesn't see these chats.`,
    placeholder: (nickname: string) => `Ask about ${nickname}'s money or learning…`,
    pick: "Ask about",
    suggestions: (nickname: string) => parentCards(nickname).map((card) => card.question),
    off: (nickname: string) =>
      `Jarso is off for ${nickname}. Turn it on from ${nickname}'s page to ask about them.`,
  },
  newChat: "Start a new chat",
  chatFull: "This chat is full. Start a new chat to keep going.",
  routes: {
    off_topic: "I can only help with money and Jarso's topics. Want to look at one of these?",
    personal_info: "Let's keep personal stuff private. Ask me about money instead.",
    safety:
      "Thank you for telling me. That sounds hard, and you deserve support. Please talk to an adult you trust, like a parent, carer or teacher. You can also talk to someone now:",
    safetyEmergency: "If you're in danger right now, call your local emergency number.",
    unsafe: "I can't help with that. I'm here for money questions.",
    jailbreak: "I'll stay as Jarso, your money helper. What would you like to know about money?",
    blocked_output:
      "Let me try that a different way. Can you ask your question again in other words?",
    unavailable:
      "Jarso is taking a break. Topics are still here. If something is worrying you, talk to an adult you trust.",
  },
  rateLimitedMinute:
    "That's a lot of questions at once. Take a short break and try again in a minute.",
  rateLimitedDay: "That's all the questions for today. Topics are still here.",
  switchedOff: "Jarso is switched off.",
} as const;
