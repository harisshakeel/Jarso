#!/usr/bin/env bash
# Local EAS Android build, run as a system unit (as your user) so systemd-oomd,
# which only polices the user session, can't kill the build or your terminal.
#
# Usage: pnpm build:apk [profile] [archs]
#   profile  EAS build profile (default: preview)
#   archs    comma list of ABIs (default: arm64-v8a,armeabi-v7a; real phones only)
# Env: JARSO_APK_DIR (default ~/builds/jarso), JAVA_HOME (default JDK 21), ANDROID_HOME (default ~/Android/Sdk)
set -euo pipefail

PROFILE="${1:-preview}"
ARCHS="${2:-arm64-v8a,armeabi-v7a}"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MOBILE_DIR="$REPO_DIR/apps/mobile"
OUT_DIR="${JARSO_APK_DIR:-$HOME/builds/jarso}"
STAMP="$(date +%Y%m%d-%H%M)"
APK="$OUT_DIR/jarso-$PROFILE-$STAMP.apk"
LOG="$OUT_DIR/build-$PROFILE-$STAMP.log"
DONE="$OUT_DIR/.build-$STAMP.done"
UNIT="jarso-apk"
PNPM_HOME="${PNPM_HOME:-$HOME/.local/share/pnpm}"
JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk-amd64}"
ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"

if systemctl is-active -q "$UNIT"; then
  echo "A build is already running: sudo systemctl status $UNIT" >&2
  exit 1
fi
command -v eas >/dev/null || PATH="$PNPM_HOME:$PATH"
command -v eas >/dev/null || { echo "eas not found (pnpm add -g eas-cli)" >&2; exit 1; }

# Deps go stale after every git pull; a stale tree fails at "expo config".
(cd "$REPO_DIR" && pnpm install --frozen-lockfile >/dev/null)

mkdir -p "$OUT_DIR"
echo "Profile $PROFILE, ABIs $ARCHS"
echo "Log: $LOG"

sudo systemd-run \
  --uid="$(id -u)" --gid="$(id -g)" \
  --unit="$UNIT" --collect \
  --working-directory="$MOBILE_DIR" \
  -p Nice=10 \
  --setenv=HOME="$HOME" \
  --setenv=PATH="$PNPM_HOME:$PATH" \
  --setenv=JAVA_HOME="$JAVA_HOME" \
  --setenv=ANDROID_HOME="$ANDROID_HOME" \
  --setenv=ORG_GRADLE_PROJECT_reactNativeArchitectures="$ARCHS" \
  bash -c "eas build -p android --profile '$PROFILE' --local --non-interactive --output '$APK' > '$LOG' 2>&1; echo \$? > '$DONE'"

echo "Building in the background (Ctrl+C stops watching, not the build)."
until [ -f "$DONE" ]; do
  if ! systemctl is-active -q "$UNIT"; then
    sleep 2
    [ -f "$DONE" ] && break
    echo "Build unit stopped without finishing: sudo journalctl -u $UNIT -n 20" >&2
    exit 1
  fi
  phase="$(grep -oE '^\[[A-Z_]+\]' "$LOG" 2>/dev/null | tail -1 || true)"
  printf '\r%s  %-24s' "$(date +%H:%M:%S)" "${phase:-starting}"
  sleep 10
done
echo

code="$(cat "$DONE")"; rm -f "$DONE"
if [ "$code" = 0 ]; then
  echo "Done: $APK"
else
  echo "Build failed (exit $code). Last lines of $LOG:" >&2
  grep -E 'What went wrong|BUILD FAILED|Error' "$LOG" | tail -10 >&2
  exit "$code"
fi
