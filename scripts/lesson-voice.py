#!/usr/bin/env python3
"""Makes the lesson films' voice: one soft, female AI recording per narration line.

Reads every mission in packages/content/src/learning/missions with a "film", and the check-in
(key "check-in"), and writes apps/web/public/lessons/voice/<key>-<n>-<hash>.mp3 for each line
that has no file yet.
The hash is FNV-1a of the line's words (the same as filmVoicePath in @jarso/core/learning), so
an edited line gets a new file and the old one is removed. Commit the files it writes.

Standard library only. The API key comes from the environment, or else from the gitignored
apps/web/.env.local, and is never printed:

    OPENAI_API_KEY=... python3 scripts/lesson-voice.py                    # OpenAI (default)
    ELEVENLABS_API_KEY=... python3 scripts/lesson-voice.py --provider elevenlabs --voice <voice id>
    OPENROUTER_API_KEY=... python3 scripts/lesson-voice.py --provider openrouter    # free Fish Audio

Options: --voice to choose the voice, --model for the OpenRouter model slug, --only <mission-key>,
--force to remake every file, --dry-run to list what it would do.
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MISSIONS = ROOT / "packages/content/src/learning/missions"
CHECK_IN = ROOT / "packages/content/src/learning/check-in.json"
OUT = ROOT / "apps/web/public/lessons/voice"
ENV_FILE = ROOT / "apps/web/.env.local"

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


def api_key(name: str) -> str:
    """The key from the environment, else from apps/web/.env.local (gitignored). Never printed."""
    key = os.environ.get(name, "")
    if not key and ENV_FILE.is_file():
        for raw in ENV_FILE.read_text(encoding="utf-8").splitlines():
            found, sep, value = raw.strip().removeprefix("export ").partition("=")
            if sep and found.strip() == name:
                value = value.strip()
                if value[:1] in ("'", '"'):
                    key = value[1:].partition(value[0])[0]
                else:
                    key = value.split(" #", 1)[0].strip()  # drop an inline comment
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


# MPEG layer III bitrates (kbit/s) by index, and sample rates by MPEG version (3: 1, 2: 2, 0: 2.5).
MP3_BITRATES = {
    3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
    2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
}
MP3_RATES = {3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000]}


def mp3_frame_length(audio: bytes, at: int) -> int:
    """Bytes in the MPEG layer III frame starting at `at`, or 0 when no valid header is there."""
    if at + 4 > len(audio) or audio[at] != 0xFF or audio[at + 1] & 0xE0 != 0xE0:
        return 0
    version = (audio[at + 1] >> 3) & 3
    layer = (audio[at + 1] >> 1) & 3
    bitrate = audio[at + 2] >> 4
    rate = (audio[at + 2] >> 2) & 3
    if version == 1 or layer != 1 or bitrate in (0, 15) or rate == 3:
        return 0
    padding = (audio[at + 2] >> 1) & 1
    kbps = MP3_BITRATES[3 if version == 3 else 2][bitrate]
    per_frame = 144_000 if version == 3 else 72_000
    return per_frame * kbps // MP3_RATES[version][rate] + padding


def is_mp3(audio: bytes) -> bool:
    """An ID3 tag, or two MPEG layer III frames back to back (raw PCM can't pass for both)."""
    if audio[:3] == b"ID3":
        return True
    first = mp3_frame_length(audio, 0)
    return first > 0 and mp3_frame_length(audio, first) > 0


def openrouter_speech(line: str, voice: str, model: str) -> bytes:
    key = api_key("OPENROUTER_API_KEY")
    audio = post(
        "https://openrouter.ai/api/v1/audio/speech",
        {"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        {
            "model": model,
            "voice": voice,
            "input": line,
            "instructions": SHORT_STYLE if model.startswith("fish-audio/") else STYLE,
            "response_format": "mp3",
        },
    )
    if not is_mp3(audio):
        sys.exit(f"{model} did not send back mp3 audio, so nothing was written for this line.")
    return audio


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--provider", choices=["openai", "elevenlabs", "openrouter"], default="openai")
    parser.add_argument(
        "--voice",
        default="",
        help="openai: shimmer (default); elevenlabs: a voice id; openrouter: Fish Audio Megan (default)",
    )
    parser.add_argument("--model", default=OPENROUTER_MODEL, help="openrouter only: the model slug")
    parser.add_argument("--only", help="one mission key, or check-in")
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
        print(f"openrouter: model {args.model}, voice {voice}")

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
    print(f"{made} made, {kept} already there, in {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
