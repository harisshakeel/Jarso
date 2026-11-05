// The welcome tour's words (2026-11-06). Plain JSON so scripts/lesson-voice.py can read the same
// lines the bubbles show and record them; validated and typed by `@jarso/core/tour`.
// `lines`: one entry per bubble ("<step>" and, for a tab, "<step>-arrive"), with {name} for the
// child's name and {buddy} for the buddy's. `voices`: lines one fixed voice says.
// `deviceVoice`: lines with no recording, read by the device's own voice. Every other line is
// said by the child's buddy, in that buddy's own voice.
import tour from "./tour.json";

export const rawTour: unknown = tour;
