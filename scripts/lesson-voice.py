#!/usr/bin/env python3
"""Makes the voices for the lesson films and the welcome tour: one AI recording per line.

Lesson films: reads every mission in packages/content/src/learning/missions with a "film", and
the check-in (key "check-in"), and writes apps/web/public/lessons/voice/<key>-<n>-<hash>.mp3 for
each line that has no file yet, in one very soft female voice.
Welcome tour (openrouter only): reads packages/content/src/tour/tour.json and writes
apps/web/public/tour/voice/<voice>-<line>-<hash>.mp3, each buddy line once in every kid's own
voice (TOUR_CAST), without the child's name, as tourVoiceClips in @jarso/core/tour lists them.
The hash is FNV-1a of the spoken words (the same as filmVoicePath and tourVoicePath), so an
edited line gets a new file and the old one is removed. Commit the files it writes.

Standard library only. The API key comes from the environment, or else from the gitignored
apps/web/.env.local, and is never printed:

    OPENAI_API_KEY=... python3 scripts/lesson-voice.py                    # OpenAI (default)
    ELEVENLABS_API_KEY=... python3 scripts/lesson-voice.py --provider elevenlabs --voice <voice id>
    OPENROUTER_API_KEY=... python3 scripts/lesson-voice.py --provider openrouter    # free Fish Audio

Options: --voice to choose the films' voice, --model for the OpenRouter model slug,
--only <mission-key>, check-in or tour, --force to remake every file, --dry-run to list what it
would do. OpenRouter's free models allow 20 requests a minute (the script paces itself) and 50
a day; when the day's run out, run it again tomorrow and it carries on where it stopped.
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MISSIONS = ROOT / "packages/content/src/learning/missions"
CHECK_IN = ROOT / "packages/content/src/learning/check-in.json"
TOUR = ROOT / "packages/content/src/tour/tour.json"
OUT = ROOT / "apps/web/public/lessons/voice"
ENV_FILE = ROOT / "apps/web/.env.local"
TOUR_OUT = ROOT / "apps/web/public/tour/voice"

# How the voice should sound: very soft and female, for children aged 11 to 14.
STYLE = (
    "Voice: a very soft, warm young woman, gentle and kind, like a favourite older cousin "
    "explaining something to an eleven-year-old. Tone: calm and encouraging, a quiet smile in "
    "the voice, never loud or over-excited. Pace: slow and unhurried, with small pauses at commas "
    "and full stops. Accent: neutral British English."
)
# Fish Audio models get `instructions` as a [bracketed] direction in front of the words, so they
# get this short form of STYLE instead of the whole paragraph.
SHORT_STYLE = "soft, warm and gentle, calm and unhurried, with a quiet smile in the voice"

# OpenRouter's free text-to-speech model, and Fish Audio's own "Megan": a young British (en-gb)
# woman, warm, friendly and relaxed (https://fish.audio/m/705690224f264386b87fb598083ab022).
OPENROUTER_MODEL = "fish-audio/s2.1-pro-free:free"
OPENROUTER_VOICE = "705690224f264386b87fb598083ab022"
# Free models allow 20 requests a minute: at most one every 3.1 seconds.
OPENROUTER_GAP = 3.1

# The welcome tour's cast: a Fish Audio Official British voice (https://fish.audio/m/<id>) for
# each kid, and how they should sound (Jarso's one line is read by the device's voice). Nell narrates the lesson films, so she keeps
# their voice. The kids, in the order coachIds lists them (design.md §7):
TOUR_CAST = {
    # Pip, a curious girl: "Briony", engaging, enthusiastic yet composed.
    "pip": ("10b2254869cf4340bdb801928e2fc88e", "bright and curious, warm and friendly"),
    # Bo, a calm boy: "Callum", calm and clear.
    "bo": ("264f4b16b61a4d63b00c5959ed55dbb9", "calm and warm, friendly and unhurried"),
    # Zuzu, a cheeky boy: "Rhys", relaxed, casual and friendly.
    "zuzu": ("43d0c55ea6814a9dab44a06ddfe03658", "cheeky and playful, warm and friendly"),
    # Nell, a thoughtful girl: "Megan", the lesson films' narrator.
    "nell": (OPENROUTER_VOICE, "warm and thoughtful, gentle and friendly"),
}
# Names as coachNames in @jarso/core/learning says them (the buddy says their own on "hello").
SPEAKER_NAMES = {"pip": "Pip", "bo": "Bo", "zuzu": "Zuzu", "nell": "Nell", "jarso": "Jarso"}
KIDS = ["pip", "bo", "zuzu", "nell"]


def text_hash(text: str) -> str:
    """FNV-1a, 32 bit, over the UTF-8 bytes, as 8 hex digits (matches textHash in TypeScript)."""
    value = 0x811C9DC5
    for byte in text.encode("utf-8"):
        value ^= byte
        value = (value * 0x01000193) & 0xFFFFFFFF
    return f"{value:08x}"


def voice_file(key: str, index: int, line: str) -> Path:
    return OUT / f"{key}-{index + 1}-{text_hash(line)}.mp3"


def films():
    """(key, lines) for every filmed mission, then the check-in's film."""
    for path in sorted(MISSIONS.glob("*.json")):
        mission = json.loads(path.read_text(encoding="utf-8"))
        if mission.get("film"):
            yield mission["key"], mission["film"]["lines"]
    check_in = json.loads(CHECK_IN.read_text(encoding="utf-8"))
    if check_in.get("film"):
        yield "check-in", check_in["film"]["lines"]


def tour_clips():
    """(voice, words, file) for every tour recording, one kid at a time (as tourVoiceClips)."""
    tour = json.loads(TOUR.read_text(encoding="utf-8"))
    clips = []
    for line_id, template in tour["lines"].items():
        if line_id in tour.get("deviceVoice", []):
            continue  # read by the device's own voice, never recorded
        fixed = tour["voices"].get(line_id)
        for voice in [fixed] if fixed else KIDS:
            # spokenTourLine: no child's name, so one recording fits every child.
            words = re.sub(r",? \{name\}", "", template).replace("{buddy}", SPEAKER_NAMES[voice])
            clips.append((voice, words, TOUR_OUT / f"{voice}-{line_id}-{text_hash(words)}.mp3"))
    order = ["nell", *[kid for kid in KIDS if kid != "nell"]]
    return sorted(clips, key=lambda clip: order.index(clip[0]))


def api_key(name: str) -> str:
    """The key from the environment, else from apps/web/.env.local (gitignored). Never printed."""
    key = os.environ.get(name, "")
    if not key and ENV_FILE.is_file():
        for raw in ENV_FILE.read_text(encoding="utf-8").splitlines():
            found, sep, value = raw.strip().removeprefix("export ").partition("=")
            if sep and found.strip() == name:
                key = value.strip().strip("\"'")
                break
    if not key:
        sys.exit(f"Set {name} in your shell or apps/web/.env.local first (never in a chat).")
    return key


def post(url: str, headers: dict, body: dict) -> bytes:
    request = urllib.request.Request(
        url, data=json.dumps(body).encode("utf-8"), headers=headers, method="POST"
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")[:300]
        if error.code == 429:
            sys.exit(
                f"The voice service said 429 (too many requests): {detail}\n"
                "Free models allow 50 requests a day. Run this again tomorrow: the files already "
                "made are kept and it carries on from there."
            )
        sys.exit(f"The voice service said {error.code}: {detail}")


def openai_speech(line: str, voice: str) -> bytes:
    key = api_key("OPENAI_API_KEY")
    return post(
        "https://api.openai.com/v1/audio/speech",
        {"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        {
            "model": "gpt-4o-mini-tts",
            "voice": voice,
            "input": line,
            "instructions": STYLE,
            "response_format": "mp3",
        },
    )


def elevenlabs_speech(line: str, voice: str) -> bytes:
    key = api_key("ELEVENLABS_API_KEY")
    if not voice:
        sys.exit("ElevenLabs needs --voice <voice id> (a soft female voice from its library).")
    return post(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_128",
        {"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"},
        {
            "text": line,
            "model_id": "eleven_multilingual_v2",
            "voice_settings": {
                "stability": 0.65,
                "similarity_boost": 0.75,
                "style": 0.1,
                "speed": 0.9,
            },
        },
    )


def is_mp3(audio: bytes) -> bool:
    """An ID3 tag, or an MPEG audio frame header (eleven sync bits), at the very start."""
    return audio[:3] == b"ID3" or (len(audio) > 1 and audio[0] == 0xFF and audio[1] & 0xE0 == 0xE0)


last_request = 0.0


def openrouter_speech(line: str, voice: str, model: str, style: str | None = None) -> bytes:
    global last_request
    key = api_key("OPENROUTER_API_KEY")
    if style is None:
        style = SHORT_STYLE if model.startswith("fish-audio/") else STYLE
    time.sleep(max(0.0, last_request + OPENROUTER_GAP - time.monotonic()))
    last_request = time.monotonic()
    audio = post(
        "https://openrouter.ai/api/v1/audio/speech",
        {"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        {
            "model": model,
            "voice": voice,
            "input": line,
            "instructions": style,
            "response_format": "mp3",
        },
    )
    if not is_mp3(audio):
        sys.exit(f"{model} did not send back mp3 audio, so nothing was written for this line.")
    return audio


def make_films(args, speak, voice: str) -> tuple[int, int]:
    OUT.mkdir(parents=True, exist_ok=True)
    made = kept = 0
    for key, lines in films():
        if args.only and key != args.only:
            continue
        wanted = {voice_file(key, i, line).name for i, line in enumerate(lines)}
        for old in OUT.glob(f"{key}-*.mp3"):
            if old.name not in wanted:
                print(f"remove {old.name} (its line changed)")
                if not args.dry_run:
                    old.unlink()
        for i, line in enumerate(lines):
            target = voice_file(key, i, line)
            if target.exists() and not args.force:
                kept += 1
                continue
            print(f"make   {target.name}: {line}")
            if not args.dry_run:
                target.write_bytes(speak(line, voice))
            made += 1
    return made, kept


def make_tour(args) -> tuple[int, int]:
    TOUR_OUT.mkdir(parents=True, exist_ok=True)
    clips = tour_clips()
    wanted = {target.name for _, _, target in clips}
    for old in TOUR_OUT.glob("*.mp3"):
        if old.name not in wanted:
            print(f"remove tour/{old.name} (its line changed)")
            if not args.dry_run:
                old.unlink()
    made = kept = 0
    for voice, words, target in clips:
        if target.exists() and not args.force:
            kept += 1
            continue
        print(f"make   tour/{target.name}: {words}")
        if not args.dry_run:
            fish_voice, style = TOUR_CAST[voice]
            target.write_bytes(openrouter_speech(words, fish_voice, args.model, style))
        made += 1
    return made, kept


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--provider", choices=["openai", "elevenlabs", "openrouter"], default="openai")
    parser.add_argument(
        "--voice",
        default="",
        help="the films' voice. openai: shimmer (default); elevenlabs: a voice id; "
        "openrouter: Fish Audio Megan (default)",
    )
    parser.add_argument("--model", default=OPENROUTER_MODEL, help="openrouter only: the model slug")
    parser.add_argument("--only", help="one mission key, check-in, or tour")
    parser.add_argument("--force", action="store_true", help="remake files that already exist")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    voice = args.voice or {"openai": "shimmer", "openrouter": OPENROUTER_VOICE}.get(args.provider, "")
    speak = {
        "openai": openai_speech,
        "elevenlabs": elevenlabs_speech,
        "openrouter": lambda line, voice: openrouter_speech(line, voice, args.model),
    }[args.provider]
    if args.provider == "openrouter":
        print(f"openrouter: model {args.model}, films' voice {voice}")

    made = kept = 0
    if args.only != "tour":
        made, kept = make_films(args, speak, voice)
        print(f"{made} made, {kept} already there, in {OUT.relative_to(ROOT)}")
    if args.only in (None, "tour"):
        if args.provider != "openrouter":
            print("tour skipped: its cast is Fish Audio voices, so it needs --provider openrouter")
            return
        made, kept = make_tour(args)
        print(f"{made} made, {kept} already there, in {TOUR_OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
