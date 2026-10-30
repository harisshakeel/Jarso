import "server-only";

/**
 * A keyword net for when the screens can't run (a budget is spent, the circuit breaker
 * is open, or Claude is down). It errs toward support: a match gets the safety reply with
 * helplines and a flag instead of "the guide is taking a break". The Haiku input screen remains
 * the real classifier; this only covers the gaps.
 */
const PATTERNS: RegExp[] = [
  /\b(kill|hurt|harm|cut)(ing)?\s+(my\s*self|myself)\b/i,
  /\bsuicid/i,
  /\b(want|wanna|going)\s+to\s+die\b/i,
  /\bdon'?t\s+want\s+to\s+(be\s+here|live)\b/i,
  /\bself[-\s]?harm/i,
  /\b(hit|hits|hitting|beat|beats|beating|hurt|hurts|hurting|touch|touches|touched)\s+me\b/i,
  /\b(abuse|abused|abusing|bully|bullied|bullying|threaten|threatened|threatening)\b/i,
  /\b(scared|afraid|frightened)\s+(to\s+go\s+home|of\s+(my|him|her|them))\b/i,
  /\brun(ning)?\s+away\b/i,
  /\b(keep\s+it\s+a\s+secret|don'?t\s+tell\s+(my|your)\s+(parents?|mum|mom|dad))\b/i,
  /\bsend\s+(me\s+)?(pics|pictures|photos|nudes)\b/i,
  /\b(no\s+food|haven'?t\s+eaten|not\s+safe)\b/i,
];

export function looksUnsafe(text: string): boolean {
  return PATTERNS.some((pattern) => pattern.test(text));
}
