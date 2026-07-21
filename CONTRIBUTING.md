# Contributing

Thanks for looking at `chatling`. This is an npm workspaces monorepo: `packages/widget` (the
publishable widget) and `packages/worker` (the Cloudflare Worker proxy template).

## Before you touch anything

**[`PRD.md`](./PRD.md) is the source-of-truth behavior spec.** It documents *why* things work the
way they do, including several decisions that look over-engineered until you read the reasoning —
drag-vs-click handling, the greeting-popup cooldown, the `[hidden]` CSS override, the Worker's
security controls. If you're changing behavior around dragging/positioning, the greeting popup,
expand/collapse, or anything in `packages/worker/src/sanitize.ts` or `cors.ts`, read the relevant
section first. Almost all of it encodes a real bug or bad UX that was already tried and rejected
once — "simplifying" it away tends to reintroduce the original problem.

## Getting started

```bash
git clone git@github.com:towfiq-ul/chatling.git
cd chatling
npm install
npm run build
```

`packages/worker` also needs local secrets for `wrangler dev` to run:

```bash
cd packages/worker
cp .dev.vars.example .dev.vars   # fill in real values, gitignored
```

## Everyday commands

Run from the repo root — these operate across both workspaces:

```bash
npm run build       # tsup (widget) + tsc --noEmit (worker)
npm run typecheck    # tsc --noEmit per workspace
npm run lint          # biome check .
npm run format          # biome check --write . — run this before committing
npm test                # unit tests (Vitest), both workspaces
npm run test:e2e         # Playwright, against a real wrangler dev instance
```

Single test file: `npx vitest run <path>` from `packages/widget` or `packages/worker`. Single
Playwright spec: `npx playwright test e2e/<file>.spec.ts -g "<test name>"`.

Worker-specific, from `packages/worker`: `npm run dev` (wrangler dev), `npm run tail` (live logs —
the fastest way to tell whether something failing end-to-end is a bad-origin rejection, a rate
limit, or an upstream error).

## Testing philosophy — please don't skip the E2E suite

Type-checking and a green build verify the code compiles, not that the feature works. This
project's original build shipped a real bug (a paid-tier model silently 402ing) that no amount of
type-checking caught — only an end-to-end test against a running Worker did. So:

- Unit tests (Vitest) are for pure logic: state transitions, math, validation, sanitization.
- **Playwright E2E is the primary verification for anything user-facing or Worker-facing.** If
  you change the widget's UI/behavior or the Worker's request flow, add or update an E2E spec in
  `e2e/`, and actually run `npm run test:e2e` before opening a PR — don't rely on unit tests alone
  to prove a UI change works.

## Code style

[Biome](https://biomejs.dev) handles both linting and formatting (`biome.jsonc` at the repo root)
— there's no separate ESLint/Prettier setup. Run `npm run format` before committing; `npm run lint`
in CI-equivalent mode will fail on anything it wouldn't fix.

Comments should explain *why*, not *what* — the codebase leans on well-named functions/variables
instead of narrating obvious code. See `CLAUDE.md`'s "Non-obvious decisions worth preserving"
section for the kind of thing that *does* warrant a comment (a subtle ordering requirement, a
workaround for a specific bug, etc.).

## Making a change

1. Branch off `main`.
2. Make your change. If it touches widget behavior, worker security controls, or anything listed
   in `CLAUDE.md`'s "Non-obvious decisions" section, check `PRD.md` first.
3. `npm run format && npm run lint && npm run typecheck && npm test && npm run test:e2e` — all
   green before you open a PR.
4. Write a commit message that explains *why*, not just *what changed* (the diff already shows
   what changed).
5. Open a PR against `main`. Describe what you tested manually, if anything, beyond the automated
   suites — especially for anything drag/position/timing-related, since those are the areas most
   likely to look right in a unit test and still be broken in a real browser.

## Reporting bugs / proposing features

Open a GitHub issue on [towfiq-ul/chatling](https://github.com/towfiq-ul/chatling). For bugs,
include: what you expected, what happened, and — if it's Worker-related — what `wrangler tail`
showed at the time, since the client-facing error message is intentionally vague.
