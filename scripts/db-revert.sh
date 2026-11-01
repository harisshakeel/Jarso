#!/usr/bin/env sh
# Marks the given migration versions as not applied on the linked project (emergency rollback).
# Refuses to run without versions: `supabase migration repair` with none repairs the whole history.
set -eu

if [ "$#" -eq 0 ]; then
  echo "Usage: pnpm db:revert <version> [<version>...]  (e.g. 20261101230000)" >&2
  exit 1
fi
for version in "$@"; do
  case "$version" in
    *[!0-9]* | "") echo "Not a migration version: $version" >&2; exit 1 ;;
  esac
done

exec supabase migration repair --linked --status reverted "$@"
