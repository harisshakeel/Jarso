---
name: public-repo-security
description: Secret handling and data hygiene for Jarso, whose source AND agent session logs (.claude-logs/) are public for hackathon evaluation. Use this skill whenever a task touches environment variables, API keys, Supabase or Anthropic credentials, .env files, CI secrets, deployment config, authentication, logging, test fixtures with user data, or anything that will be written to a log, doc, commit or PR. Also use it the moment a credential-shaped string (sb_secret_, sb_publishable_, sk-ant-, eyJ…, ghp_, a connection string with a password) appears anywhere in the conversation, and when the user asks to "set up env", "add a key", "configure Supabase/Vercel", "paste my token", or asks whether something is safe to commit. Policy and the rotation runbook live in docs/security.md; this skill is how the agent behaves.
---

# Working safely in a public repo

Everything in this repository is public, including the transcript of this very session once the Stop hook writes `.claude-logs/`. Your prompts, your responses and every file you commit will be read by hackathon judges and by anyone on the internet. The users are children. Act accordingly: a secret that appears in your output is published, and a child's data that appears in a fixture is published.

Redaction exists (`.claude/hooks/extract-log.py`), a pre-commit scan exists (`scripts/check-secrets.sh`), gitleaks runs in CI, and GitHub push protection is on. Treat all of them as nets under the tightrope, not as the tightrope. The goal is that nothing ever reaches them.

## Rules

1. **Never read a secret.** Do not open `.env`, `.env.local` or anything under `~/.claude`; the project settings deny it, and you should not look for a way around. Read `.env.example` for variable names. If you need to know whether a variable is set, check `process.env.X ? "set" : "unset"` in a script, never its value.
2. **Never ask for a secret.** Do not tell the user to paste a key, token, password or connection string into chat. Tell them where to put it (`.env.local`, host env vars, GitHub repository secrets) and what the variable is called.
3. **Never echo a secret.** No `cat .env*`, no `echo $SUPABASE_SECRET_KEY`, no `supabase status` output pasted into a response (it prints keys), no `vercel env pull`, no printing of request headers that may carry cookies or bearer tokens, no logging of full Supabase responses.
4. **Placeholders must look like placeholders.** Write `sb_secret_…`, `<project-ref>`, `${ANTHROPIC_API_KEY}`. Never invent a realistic-looking key for an example, test or doc; realistic shapes trigger the scanners and teach readers to paste real ones.
5. **Fixtures are obviously fake.** Test users are `child-one@example.test`, names like "Test Child". Never a real email, never a real child's data, never a screenshot of a real account.
6. **Logs carry ids, not identities.** Server logs get `userId` and a request id. Never emails, names, diary labels, guide messages or full rows. The `logger` helper is the only console sink.
7. **New credential type, three lists.** If a change introduces a new kind of secret (a new provider, a webhook signing key), add its shape to the `REDACTIONS` list in `.claude/hooks/extract-log.py`, the pattern in `scripts/check-secrets.sh`, and a rule in `.gitleaks.toml`, in the same PR.
8. **Env vars go through config.** Declare in `src/config/env.client.ts` or `env.server.ts`, add to `.env.example` with an empty or placeholder value, document in `docs/security.md`'s table. `NEXT_PUBLIC_` only for values that are safe in every browser.
9. **Nothing privileged from the client.** `@/lib/supabase/admin`, `@/config/env.server` and `@/lib/api` never appear in a `"use client"` file or a client-safe barrel.
10. **Migrations and schema pushes are CI's job.** Do not run `supabase db push`; the settings deny it. Write the migration, let CI apply it.

## If a secret appears anyway

Stop the task. Do not try to quietly delete it, and do not continue as if it did not happen; the transcript already contains it.

1. Tell the user plainly what appeared and where (chat, file, log, commit).
2. Point them at the rotation runbook in `docs/security.md` and name the exact key to rotate first.
3. If it is in a file, remove it. If it is in a commit that was pushed, say that history must be rewritten and offer to do it after rotation.
4. If it is in `.claude-logs/`, redact the file by hand and extend `REDACTIONS` so the shape is caught next time.
5. Only then resume the original task.

## Quick checks before committing

- `git diff --cached` contains no `.env*` file and no string that looks like a key, token, JWT or `user:password@host`.
- No new email addresses except `@example.test` or GitHub noreply.
- No new `process.env` reads outside `src/config` (and the logger).
- Docs and tests use placeholders that cannot be mistaken for real values.
- If the change touches auth, RLS, API routes or secrets, run the `security-auditor` agent.

## What is fine to be public

So you do not over-redact: the Supabase project URL and project ref (they ship to every browser), the publishable key *in the deployed app* (but not in the repo), route paths, table and column names, migration SQL, RLS policies, CI configuration without secrets, and GitHub noreply email addresses. Hiding these buys nothing and makes the logs less useful to the judges.
