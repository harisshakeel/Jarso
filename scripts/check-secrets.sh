#!/usr/bin/env sh
# Pre-commit guard: refuse to commit credential-shaped strings or .env files.
# This repository is PUBLIC. Keep patterns in sync with .claude/hooks/extract-log.py and .gitleaks.toml.
set -eu

pattern='sb_(secret|publishable)_[A-Za-z0-9_-]{12,}|sbp_[A-Za-z0-9]{20,}|sk-ant-[A-Za-z0-9_-]{12,}|sk-(proj-|live_|test_)[A-Za-z0-9_-]{12,}|(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|xox[baprs]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|(postgres(ql)?|mysql|mongodb(\+srv)?|redis|amqp)://[A-Za-z0-9._%-]+:[A-Za-z0-9._%+!$*#~-]{4,}@|-----BEGIN [A-Z ]*PRIVATE KEY-----'

files=$(git diff --cached --name-only --diff-filter=ACMR || true)
[ -z "$files" ] && exit 0

# 1. No .env files except .env.example
env_files=$(printf '%s\n' "$files" | grep -E '(^|/)\.env(\..+)?$' | grep -vE '(^|/)\.env\.example$' || true)
if [ -n "$env_files" ]; then
  echo "✖ Refusing to commit environment files:"
  printf '  %s\n' $env_files
  exit 1
fi

# 2. No credential-shaped strings in added lines (lockfile excluded: integrity hashes are not secrets)
scan_files=$(printf '%s\n' "$files" | grep -vE '(^|/)pnpm-lock\.yaml$' || true)
[ -z "$scan_files" ] && exit 0
# shellcheck disable=SC2086
hits=$(git diff --cached -U0 -- $scan_files | grep -E '^\+' | grep -vE '^\+\+\+' | grep -E "$pattern" || true)
if [ -n "$hits" ]; then
  echo "✖ Possible credential in staged changes:"
  printf '%s\n' "$hits" | cut -c1-160 | sed 's/^/  /'
  echo "Remove it before committing. If it is a real key, rotate it now (docs/security.md)."
  exit 1
fi
