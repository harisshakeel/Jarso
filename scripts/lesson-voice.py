#!/usr/bin/env python3
"""Makes the lesson films' voice: one soft, female AI recording per narration line.

Reads every mission in packages/content/src/learning/missions with a "film", and the check-in
(key "check-in"), and writes apps/web/public/lessons/voice/<key>-<n>-<hash>.mp3 for each line
that has no file yet.
The hash is FNV-1a of the line's words (the same as filmVoicePath in @jarso/core/learning), so
an edited line gets a new file and the old one is removed. Commit the files it writes.

Standard library only. The API key comes from the environment and is never printed:

    OPENAI_API_KEY=... python3 scripts/lesson-voice.py                    # OpenAI (default)
    ELEVENLABS_API_KEY=... python3 scripts/lesson-voice.py --provider elevenlabs --voice <voice id>

Options: --voice to choose the voice, --only <mission-key>, --force to remake every file,
--dry-run to list what it would do.
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

# How the voice should sound: very soft and female, for children aged 11 to 14.
STYLE = (
    "Voice: a very soft, warm young woman, gentle and kind, like a favourite older cousin "
    "explaining something to an eleven-year-old. Tone: calm and encouraging, a quiet smile in "
    "the voice, never loud or over-excited. Pace: slow and unhurried, with small pauses at commas "
    "and full stops. Accent: neutral British English."
)


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
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        sys.exit("Set OPENAI_API_KEY in your shell first (never paste it into a chat).")
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
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        sys.exit("Set ELEVENLABS_API_KEY in your shell first (never paste it into a chat).")
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


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--provider", choices=["openai", "elevenlabs"], default="openai")
    parser.add_argument("--voice", default="", help="openai: shimmer (default); elevenlabs: a voice id")
    parser.add_argument("--only", help="one mission key, or check-in")
    parser.add_argument("--force", action="store_true", help="remake files that already exist")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    voice = args.voice or ("shimmer" if args.provider == "openai" else "")
    speak = openai_speech if args.provider == "openai" else elevenlabs_speech

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
