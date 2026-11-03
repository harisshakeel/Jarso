#!/usr/bin/env bash
# Which Playwright projects a change needs (CI, pull requests only; main runs everything).
#
# Usage: scripts/e2e-projects.sh <base ref>   → prints "--project a --project b …", or nothing
# for "run them all". The map goes from the folders a change touched to the specs that cover
# them; anything shared by every page (the shell, auth, the family, the database, the packages)
# runs the whole suite. Every PR run includes the smoke project.
set -euo pipefail

base="${1:-origin/main}"
# E2E_CHANGED_FILES (newline-separated) stands in for the diff, for checking the map by hand.
changed="${E2E_CHANGED_FILES:-$(git diff --name-only "$base"...HEAD)}"

all=false
want=" smoke "

# Plain strings, so the script also runs on macOS's bash 3 (no associative arrays).
add() {
  for p in "$@"; do
    case "$want" in *" $p "*) ;; *) want="$want$p " ;; esac
  done
}

while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in
    # Shared by every page, or below the app: the whole suite.
    apps/web/src/app/\(app\)/layout.tsx|apps/web/src/app/layout.tsx|apps/web/src/app/globals.css|\
    apps/web/src/components/shell/*|apps/web/src/components/ui/*|apps/web/src/components/form/*|\
    apps/web/src/proxy.ts|apps/web/src/lib/*|apps/web/src/config/*|apps/web/src/types/*|\
    apps/web/src/features/auth/*|apps/web/src/features/family/*|apps/web/src/features/profiles/*|\
    apps/web/src/features/offline/*|apps/web/src/features/notifications/*|\
    apps/web/src/app/\(auth\)/*|apps/web/src/app/\(app\)/profile-gate.tsx|apps/web/src/app/\(app\)/header-avatar.tsx|\
    apps/web/next.config.ts|apps/web/playwright.config.ts|apps/web/package.json|apps/web/tests/e2e/helpers.ts|apps/web/tests/e2e/local-supabase.ts|\
    packages/*|supabase/*|pnpm-lock.yaml|package.json|turbo.json|.github/workflows/ci.yml)
      all=true ;;
    # A spec itself.
    apps/web/tests/e2e/smoke.spec.ts) ;;
    apps/web/tests/e2e/theme.spec.ts) add theme ;;
    apps/web/tests/e2e/landing.spec.ts) add landing ;;
    apps/web/tests/e2e/onboarding.spec.ts) add onboarding ;;
    apps/web/tests/e2e/email-confirm.spec.ts) add auth ;;
    apps/web/tests/e2e/allowance.spec.ts) add allowance ;;
    apps/web/tests/e2e/child-home.spec.ts) add child-home ;;
    apps/web/tests/e2e/purchases.spec.ts) add purchases ;;
    apps/web/tests/e2e/diary.spec.ts) add diary ;;
    apps/web/tests/e2e/requests.spec.ts) add requests ;;
    apps/web/tests/e2e/handover-race.spec.ts) add handover-race ;;
    apps/web/tests/e2e/requests-race.spec.ts) add requests-race ;;
    apps/web/tests/e2e/inbox.spec.ts) add inbox ;;
    apps/web/tests/e2e/learning.spec.ts) add learning ;;
    apps/web/tests/e2e/guide.spec.ts) add guide ;;
    apps/web/tests/e2e/payments.spec.ts) add payments ;;
    apps/web/tests/e2e/family-settings.spec.ts) add settings ;;
    apps/web/tests/e2e/parent-profile.spec.ts) add profile ;;
    apps/web/tests/e2e/offline-purchase.spec.ts) add offline-purchase ;;
    apps/web/tests/e2e/offline-mission.spec.ts) add offline-mission ;;
    apps/web/tests/e2e/offline-parent.spec.ts) add offline-parent ;;
    # Areas.
    apps/web/src/features/landing/*|apps/web/src/app/\(marketing\)/*) add landing theme ;;
    apps/web/src/components/theme/*) add theme ;;
    apps/web/src/features/guide/*|apps/web/src/app/\(app\)/child/jarso/*|apps/web/src/app/\(app\)/parent/jarso/*|apps/web/src/app/\(app\)/parent/children/\[childId\]/guide/*) add guide ;;
    apps/web/src/features/learning/*|apps/web/src/app/\(app\)/child/learn/*|apps/web/src/app/\(app\)/parent/children/\[childId\]/learning/*) add learning offline-mission child-home ;;
    apps/web/src/features/ledger/*|apps/web/src/features/diary/*|apps/web/src/components/jar/*|apps/web/src/app/\(app\)/child/diary/*) add child-home purchases diary offline-purchase ;;
    apps/web/src/features/goals/*|apps/web/src/app/\(app\)/child/goal/*) add child-home ;;
    apps/web/src/features/requests/*|apps/web/src/app/\(app\)/child/requests/*) add requests requests-race handover-race child-home ;;
    apps/web/src/features/rules/*|apps/web/src/app/\(app\)/parent/children/\[childId\]/rules/*) add purchases requests ;;
    apps/web/src/features/allowance/*|apps/web/src/app/\(app\)/parent/allowance/*) add allowance handover-race child-home ;;
    apps/web/src/features/payments/*|apps/web/src/app/api/*) add payments allowance ;;
    apps/web/src/features/review/*) add learning child-home ;;
    apps/web/src/components/brand/*|apps/web/src/components/sounds/*) add child-home learning landing ;;
    apps/web/src/app/\(app\)/child/*) add child-home ;;
    apps/web/src/app/\(app\)/parent/*) add allowance requests inbox settings profile ;;
    apps/web/src/app/\(app\)/settings/*|apps/web/src/app/\(app\)/*/settings/*) add settings profile ;;
    apps/web/src/*) all=true ;;
    # Docs, logs, config of ours: nothing extra.
    *) ;;
  esac
done <<< "$changed"

if $all; then exit 0; fi
for p in $want; do printf -- "--project %s " "$p"; done
echo
