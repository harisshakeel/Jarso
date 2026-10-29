// Reviewed text the app shows instead of a model reply (spec §5.2 step 7). Child-facing:
// reading age about 10, warm, no blame, no exclamation marks. Change only through a PR review.

export const guideCopy = {
  label: "AI guide",
  disclosure: "AI guide. Your parent can see these chats.",
  intro: [
    "I'm Jarso's AI guide. I'm a computer program, not a person, and I can get things wrong.",
    "Your parent can see our chats.",
    "Please don't share personal details like your full name, address, school or phone number.",
  ],
  introButton: "Got it",
  placeholder: "Ask about money…",
  thinking: "Thinking…",
  newChat: "Start a new chat",
  chatFull: "This chat is full. Start a new chat to keep going.",
  routes: {
    off_topic: "I can only help with money and Jarso's topics. Want to look at one of these?",
    personal_info: "Let's keep personal stuff private. Ask me about money instead.",
    safety:
      "Thank you for telling me. That sounds hard, and you deserve support. Please talk to an adult you trust, like a parent, carer or teacher. You can also talk to someone now:",
    safetyEmergency: "If you're in danger right now, call your local emergency number.",
    unsafe: "I can't help with that. I'm here for money questions.",
    jailbreak: "I'll stay as Jarso's money guide. What would you like to know about money?",
    blocked_output:
      "Let me try that a different way. Can you ask your question again in other words?",
    unavailable: "The guide is taking a break. Topics are still here.",
  },
  rateLimitedMinute:
    "That's a lot of questions at once. Take a short break and try again in a minute.",
  rateLimitedDay: "That's all the guide questions for today. Topics are still here.",
  switchedOff: "The guide is switched off.",
} as const;
