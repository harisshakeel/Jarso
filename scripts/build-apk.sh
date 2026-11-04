#!/usr/bin/env bash
# Local EAS Android build, run as a system unit (as your user), outside the user session.
# Ubuntu's systemd-oomd watches the user session's memory pressure, so a heavy Gradle run
# there can take down the whole session; as a system unit it can't. oomd can still kill
# the build if a parent slice is watched (e.g. ManagedOOMSwap=kill on -.slice).
#
# Usage: pnpm build:apk [profile] [archs]
#   profile  EAS build profile (default: preview)
#   archs    comma list of ABIs (default: arm64-v8a,armeabi-v7a; real phones only)
# Env: JARSO_APK_DIR (default ~/builds/jarso), JAVA_HOME (default JDK 21), ANDROID_HOME (default ~/Android/Sdk),
#      GOOGLE_SERVICES_JSON (default apps/mobile/google-services.json, git-ignored; without it no push)
set -euo pipefail

PROFILE="${1:-preview}"
ARCHS="${2:-arm64-v8a,armeabi-v7a}"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MOBILE_DIR="$REPO_DIR/apps/mobile"
OUT_DIR="${JARSO_APK_DIR:-$HOME/builds/jarso}"
STAMP="$(date +%Y%m%d-%H%M%S)"
APK="$OUT_DIR/jarso-$PROFILE-$STAMP.apk"
LOG="$OUT_DIR/build-$PROFILE-$STAMP.log"
DONE="$OUT_DIR/.build-$STAMP.done"
UNIT="jarso-apk"
PNPM_HOME="${PNPM_HOME:-$HOME/.local/share/pnpm}"
JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk-amd64}"
ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
# eas build --local skips EAS file env vars, so the GOOGLE_SERVICES_JSON var on EAS never
# reaches a local build: hand it a local copy instead. Absolute, since the build runs in a copy.
GOOGLE_SERVICES_JSON="${GOOGLE_SERVICES_JSON:-$MOBILE_DIR/google-services.json}"
GOOGLE_SERVICES_JSON="$(realpath -m "$GOOGLE_SERVICES_JSON")"

if systemctl is-active -q "$UNIT"; then
  echo "A build is already running: sudo systemctl status $UNIT" >&2
  exit 1
fi
command -v eas >/dev/null || PATH="$PNPM_HOME:$PATH"
command -v eas >/dev/null || { echo "eas not found (pnpm add -g eas-cli)" >&2; exit 1; }

# Only APK profiles install on a phone; production builds an app bundle for the store.
BUILD_TYPE="$(node -e '
  const b = require(process.argv[1]).build; let p = b[process.argv[2]], t;
  while (p && !(t = p.android?.buildType)) p = b[p.extends];
  console.log(p ? t : "missing");
' "$MOBILE_DIR/eas.json" "$PROFILE")"
case "$BUILD_TYPE" in
  apk) ;;
  missing) echo "No EAS profile \"$PROFILE\" in apps/mobile/eas.json" >&2; exit 1 ;;
  *) echo "Profile $PROFILE builds ${BUILD_TYPE:-an app bundle}, not an APK" >&2; exit 1 ;;
esac

FCM_ARGS=()
PUSH=off
if [ -f "$GOOGLE_SERVICES_JSON" ]; then
  FCM_ARGS=(--setenv=GOOGLE_SERVICES_JSON="$GOOGLE_SERVICES_JSON")
  PUSH=on
else
  echo "No $GOOGLE_SERVICES_JSON: this build gets no push token (docs/mobile.md, Push credentials)" >&2
fi

# The unit starts with a clean environment: hand EXPO_TOKEN over as a systemd credential
# (never --setenv, which anyone can read with systemctl show), else need a saved eas login.
CRED_ARGS=()
if [ -n "${EXPO_TOKEN:-}" ]; then
  TOKEN_FILE="$(mktemp)"
  trap 'rm -f "$TOKEN_FILE"' EXIT
  printf '%s' "$EXPO_TOKEN" > "$TOKEN_FILE"
  CRED_ARGS=(-p "LoadCredential=expo-token:$TOKEN_FILE")
elif ! eas whoami >/dev/null 2>&1; then
  echo "Not logged in to Expo: run eas login, or set EXPO_TOKEN" >&2
  exit 1
fi

# Deps go stale after every git pull; a stale tree fails at "expo config".
(cd "$REPO_DIR" && pnpm install --frozen-lockfile >/dev/null)

mkdir -p "$OUT_DIR"
# A watcher stopped with Ctrl+C leaves its .done file; never read a stale one.
rm -f "$DONE"
echo "Profile $PROFILE, ABIs $ARCHS, push $PUSH"
echo "Log: $LOG"

sudo systemd-run \
  --uid="$(id -u)" --gid="$(id -g)" \
  --unit="$UNIT" --collect \
  --working-directory="$MOBILE_DIR" \
  -p Nice=10 \
  "${CRED_ARGS[@]}" \
  "${FCM_ARGS[@]}" \
  --setenv=HOME="$HOME" \
  --setenv=PATH="$PNPM_HOME:$PATH" \
  --setenv=JAVA_HOME="$JAVA_HOME" \
  --setenv=ANDROID_HOME="$ANDROID_HOME" \
  --setenv=ORG_GRADLE_PROJECT_reactNativeArchitectures="$ARCHS" \
  bash -c '
    cred="${CREDENTIALS_DIRECTORY:-}/expo-token"
    if [ -r "$cred" ]; then EXPO_TOKEN="$(cat "$cred")"; export EXPO_TOKEN; fi
    eas build -p android --profile "$1" --local --non-interactive --output "$2" > "$3" 2>&1
    echo $? > "$4.tmp" && mv "$4.tmp" "$4"   # the watcher never sees a half-written file
  ' build-apk "$PROFILE" "$APK" "$LOG" "$DONE"

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
  echo "Build failed (exit $code). From $LOG:" >&2
  # Gradle puts the cause on the lines after "What went wrong"; otherwise show the tail.
  if grep -q 'What went wrong' "$LOG"; then
    grep -A8 'What went wrong' "$LOG" | tail -30 >&2
  else
    tail -30 "$LOG" >&2
  fi
  exit "$code"
fi
