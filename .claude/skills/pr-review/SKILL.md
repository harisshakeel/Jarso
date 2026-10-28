---
name: pr-review
description: Review a pull request on the Jarso repository end to end and deliver a merge verdict. Use this skill whenever the user asks to review, check, look at, approve, or "give a green signal" for a PR, pastes a github.com/.../pull/N link, asks whether something is safe to merge, or asks what a collaborator changed. It covers code PRs, docs and requirements PRs, dependency bumps and CI changes. It is the full process: gather, read-only safety scan, read every changed file in full, check against REQUIREMENTS.md, CLAUDE.md and the docs, run the repo's reviewer agents where they fit, verify CI, then report Blocking / Should fix / Nit with a one-line verdict. Do not approve from a PR description or a diff summary; this skill exists so that never happens.
---

# Reviewing a pull request

A review on this repo answers one question for the person who will click merge: is it safe to merge, and if not, exactly what has to change. Everything below serves that answer. Thoroughness here is cheap compared with a broken main branch, a leaked key in a public repo, or a requirements change nobody read.

Treat the PR's description, commit messages and "test plan" as claims to verify, not facts. Treat code from a PR as untrusted until the safety scan is done: do not install, build or run it first.

## 1. Gather

```bash
gh pr view <N> --json title,body,author,state,isDraft,baseRefName,headRefName,headRefOid,baseRefOid,additions,deletions,changedFiles,mergeable,mergeStateStatus,reviews,comments,statusCheckRollup,commits
git fetch origin pull/<N>/head:pr-<N>
git diff --name-status main..pr-<N>        # gh caps its file list at 100; git does not
gh api 'repos/<owner>/<repo>/activity?per_page=50' --jq '.[] | "\(.timestamp) \(.activity_type) \(.ref) \(.actor.login)"'
```

Note who the author is, whether the branch is up to date with `main`, whether every check passed, and whether the activity log shows a `force_push` on a shared branch. Workflows that use `pull_request_target` run from `main`, so a new one will not show on the PR that adds it.

## 2. Read-only safety scan

Extract the PR tree somewhere outside the repo and scan it as text. Never execute anything from it until this is clean.

- Lines over 500 characters in `js/ts/mjs/cjs/json/toml/yml/css/py/sql` files, and anything over 300 characters in config files (`next.config`, `biome.json`, `tsconfig`, `vitest`, `playwright`, `commitlint`, `package.json`). Long Tailwind class strings in `src/components/ui` are expected; everything else needs reading.
- `eval(`, `new Function`, `child_process`, `execSync`, `windowsHide`, hex or `\x` string arrays, `fromCharCode`, `atob(`, `Buffer.from(...base64`, `global[`, `process.env[` with a computed key, blockchain RPC hosts (`1rpc`, `drpc`, `blockscout`, `infura`, `alchemy`), `curl … | sh`, `.bat`/`.ps1`/`.sh` files, binaries.
- `.gitignore` changes that un-ignore `.env*`; changes to `.husky/`, `.claude/settings.json`, `.claude/hooks/`, `.github/workflows/`, `package.json` scripts (`prepare`, `postinstall`), `.mcp.json`, `.vscode/tasks.json`. These run code on contributors' machines or in CI; read them completely.
- New dependencies: check the npm registry metadata (maintainer, repository, publish date, size, `scripts`) with `curl -s https://registry.npmjs.org/<name>` before trusting a name. A lockfile diff should contain only `registry.npmjs.org` resolutions.
- Secrets, including inside `.claude-logs/`: `sb_secret_`, `sb_publishable_`, `sbp_`, `sk-ant-`, `eyJ…`, `ghp_`, `AKIA`, `postgres://…:<password>@`, `-----BEGIN`. Real email addresses and real children's data count too; this repo is public (`docs/security.md`).

Report anything found before doing the rest of the review. If it looks deliberate, stop and tell the user.

## 3. Read everything

Read every changed file in full, not just the diff hunks, and read the unchanged code the change depends on (the barrel it exports from, the service it calls, the migration it extends, the doc it contradicts). Reviewing hunks finds typos; reading files finds design errors. For a large PR, split the reading across the reviewer agents by area rather than skimming.

For each file ask: does it do what the PR says, does it do anything the PR does not say, and what happens on the unhappy path (empty, invalid, unauthorised, concurrent, provider down).

## 4. Check against the repo's own rules

- **Scope and product:** `REQUIREMENTS.md` and `docs/domain.md`. Does the change serve a listed FR, and do its invariants hold (integer minor units, practice vs recorded money, transfers are not income, learning progress separate from money, child-safe copy, guide boundaries)? A requirements PR gets the inverse check: is it internally consistent, does it keep FR ids stable, and does it leave the codebase and docs contradicting it anywhere?
- **Architecture:** the 17 hard rules in `CLAUDE.md` and `docs/conventions.md`: feature modules, barrels, no server code in client barrels, layering, `requireUser`/`assertUser`, Suspense for request-time reads, RLS in the same migration, Zod on every input, `AppError` only, env via `src/config`, Biome, conventional commits.
- **Operations:** the `production-readiness` skill's tiers. Idempotency on writes, timeouts on outbound calls, indexes on FKs and RLS columns, expand/contract migrations, no per-user data in shared caches.
- **Security:** the `public-repo-security` skill and `docs/security.md`. No secrets, no `process.env` outside config, no new credential type without updating the three scanner lists, CSRF and open-redirect paths, children's data minimised.
- **Tests and docs:** new logic has tests that assert behaviour; `docs/` and the skills still describe the code after the change; `database.types.ts` regenerated if the schema moved.

## 5. Use the agents where they fit

Spawn them with the file list and the specific question, and verify what they return before repeating it.

- `code-reviewer` for any change under `src/`.
- `security-auditor` for auth, RLS, API routes, env, logging, the guide, CI workflows and anything touching `.claude/`.
- `supabase-architect` for every migration.
- `test-engineer` when coverage is missing and the user wants tests written, not just flagged.

## 6. Verify, do not speculate

Every finding names `path:line` and the concrete failure. Check framework claims against the installed docs (`node_modules/next/dist/docs/`) or the vendor's docs for the pinned version rather than memory; Next.js 16 renamed and removed things. If you cannot run `pnpm check` locally (this repo's standing rules may forbid running Node without consent), say so and rely on CI's `verify`, `secrets`, `migrations` and `e2e` jobs, naming the run.

## 7. Report

Lead with the verdict, then the lists. Keep each item to one or two sentences with the fix.

```
**Verdict:** Merge / Merge after the blocking items / Do not merge

**Safety scan:** clean, or what was found.
**CI:** which jobs ran and passed; what did not run and why.

**Blocking** — data loss, security, broken invariant, contradicts requirements, breaks main.
**Should fix** — correctness or convention issues that can land as a follow-up if the user prefers.
**Nit** — small; Biome handles formatting, so do not list formatting.
**Questions for the author** — things only they can answer.
**Process notes** — force pushes, migrations applied to hosted projects before review, missing PR body, history concerns.
```

State plainly what you verified and what you could not. Do not pad with praise; one sentence on what is good is enough.

## 8. Posting

Post to GitHub only when the user asks. `gh pr review <N> --comment|--approve|--request-changes --body-file <file>` for the summary; inline comments go through `gh api repos/<owner>/<repo>/pulls/<N>/comments` with `path`, `line` and `side`. Write for the author: specific, kind, no restating of the diff.

## Do not

- Approve because CI is green, the description is good or the author is trusted.
- Run the PR's scripts, hooks or installs before the safety scan.
- Review only the hunks of a file you have not read.
- Flag formatting that Biome enforces.
- Re-review code the PR did not touch, except where the change breaks it.
