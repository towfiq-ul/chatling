# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An npm package (`ai-chat-assistant-widget`) — a framework-agnostic floating AI chat widget — plus
a companion Cloudflare Worker (`packages/worker`) that each consumer deploys to their own Cloudflare
account to proxy LLM requests. `PRD.md` is the source-of-truth behavior spec: every non-obvious
UX/security decision here (and the reasoning behind it) is documented there — read it before
changing drag/position/greeting/expand-collapse behavior or the Worker's security controls, since
almost all of it encodes a real bug or bad UX that was already tried and rejected once.

`plan.md` and `TODO.md` are the original scaffold plan and its granular checklist (phase-based,
with a `Status` and `Depends on` per phase) — useful for understanding *why* the repo is laid out
the way it is, less useful as a live task tracker once the scaffold is complete.

## Commands

```bash
npm install
npm run build        # builds all workspaces (tsup for widget, tsc --noEmit for worker)
npm run typecheck     # tsc --noEmit per workspace
npm run lint           # biome check .
npm run format          # biome check --write .
npm test                # unit tests (Vitest) across workspaces
npm run test:e2e         # Playwright, against a running wrangler dev + examples/vanilla
```

Single test file: `npx vitest run <path>` from the relevant package directory (`packages/widget`
or `packages/worker`). Single Playwright spec: `npx playwright test e2e/<file>.spec.ts -g "<name>"`.

Worker-specific, from `packages/worker`:

```bash
npm run dev          # wrangler dev — local server, default http://localhost:8787
npm run deploy       # wrangler deploy
npm run tail         # wrangler tail — live logs, the actual debugging tool of record here
npm run cf-typegen   # wrangler types — regenerates worker-configuration.d.ts; rerun after any wrangler.jsonc change
```

React example, from `examples/react`: `npm install` (it has its own `node_modules`, deliberately
**not** an npm workspace member — it depends on the widget via `file:../../packages/widget` to
mirror how a real consumer would `npm install ai-chat-assistant-widget`), then `npm run dev`.

## Architecture

npm workspaces monorepo (`workspaces: ["packages/*"]`), two packages:

- **`packages/widget`** — the publishable package. `core/ChatWidgetCore.ts` is a framework-free
  class owning all state (open/closed, expanded/collapsed, messages, input, loading, error, bubble
  position, greeting visibility) and behavior (drag-vs-click via Pointer Events, position
  clamping/panel-placement math, greeting cooldown, localStorage persistence). It's a plain
  pub/sub emitter (`subscribe`/`getState`) with no DOM or framework dependency, which is what makes
  it independently unit-testable (see `ChatWidgetCore.test.ts`). `ui/render.ts` + `ui/styles.ts`
  turn that state into real DOM inside a shadow root — bubble, panel, typing-indicator dots,
  greeting popup, expand/collapse toggle — using `textContent` only (no Markdown rendering; the
  Worker's system prompt is written to match this, see below). `core/mount.ts` wires core + render
  + transport into `mount(el, options): WidgetInstance`. `element/AiChatWidgetElement.ts` is a thin
  Custom Element (`<ai-chat-widget>`) wrapping `mount()` for zero-integration embedding; primitives
  come in as kebab-case HTML attributes, callbacks/arrays as JS properties (attributes can only
  ever be strings). `auto-register.ts` is a separate side-effect-only entry point
  (`customElements.define(...)`) — kept out of the main `index.ts` export so consumers who only
  want `mount()` (e.g. from React) don't pay for or trigger the custom element registration.
  Built with tsup into ESM + CJS + IIFE + `.d.ts` (two tsup entries: `index` and `auto-register`).

- **`packages/worker`** — Cloudflare Worker (TypeScript), unpublished (`private: true`), deployed
  by each consumer to their own account. `src/index.ts` is the full request flow: OPTIONS
  preflight → origin allowlist check → secrets-present check → rate limit (fails open if the
  `RATE_LIMITER` binding is absent) → body-size check → `sanitize.ts` (field whitelist + **role
  whitelist**, the single most important control — a client can never send `role: "system"`,
  which would let it override the grounding prompt) → prepend the server-side system prompt →
  forward upstream with a 30s timeout → return the upstream response verbatim. `cors.ts` handles
  the origin allowlist (explicitly documented as **not real auth** — `Origin` is spoofable by a
  non-browser client; the rate limiter is the actual abuse boundary) and preflight. The system
  prompt is deliberately two files with different jobs: `src/RULESET.md` (persona/tone/behavior —
  changes rarely, imported as raw text via a Wrangler `Text` rule in `wrangler.jsonc`, never
  duplicated into a JS template literal) and `src/context.ts`'s `SITE_CONTEXT` (the actual
  grounding data — the one deliberate consumer-edited manual-sync point, since this Worker doesn't
  share a build step with the frontend). `RULESET.md` explicitly instructs "plain text only, no
  Markdown" — this matches the widget's `textContent`-only rendering; get this out of sync and a
  model's `**bold**`/`[links](url)` show up as literal characters to a visitor.

- **`examples/vanilla`** and **`examples/react`** — smoke-test consumers. The vanilla example
  references the widget's built `dist/` output directly via a relative path (no publish step in
  local dev); a real consumer would point at a CDN URL instead. The React example demonstrates the
  "mount as a sibling of the routed subtree" requirement using hash-based navigation with no
  router library — `ChatWidgetMount.tsx` wraps `mount()` in a `useEffect` that intentionally runs
  once (see the `biome-ignore` comment there for why re-running it on every options change would
  be wrong), and `App.tsx` renders it as a sibling of `renderPage()`'s output, not inside it.

## Non-obvious decisions worth preserving

Each of these fixes a real bug or bad UX that was already tried and rejected — worth reading
`PRD.md`'s relevant section before "simplifying" any of them away:

- **`[hidden] { display: none !important }` in `ui/styles.ts`** — every hidden-toggled element
  (`.bubble`, `.panel`, `.greeting`, `.typingIndicator`) also sets `display: flex` for its visible
  state, which otherwise beats the browser's default `[hidden] { display: none }` UA rule once an
  author stylesheet touches `display` on the same element (author styles win over UA styles
  regardless of selector specificity). Without this override, setting `.hidden = true` on any of
  these does nothing visually — found via Playwright E2E, not by a unit test or type-check.
- **Role whitelist in `sanitize.ts`** — only `user`/`assistant` are ever accepted from the client.
- **Drag vs. click** (`ChatWidgetCore.onBubblePointer{Down,Move,Up}`) uses a pixel threshold
  (`DRAG_THRESHOLD = 6`) and Pointer Events, not a time threshold or separate mouse/touch handlers.
- **Greeting-popup cooldown timestamp is written when the greeting appears, not when it's
  dismissed** (`saveGreetedAt` inside the `setTimeout` callback in `scheduleGreeting`). Writing it
  at dismiss-time means a visitor who opens the chat before the delay elapses silently burns the
  cooldown and the greeting never reappears — no error, just quietly broken.
- **Expand/collapse is pure state/CSS**, never the Fullscreen API — avoids permission prompts and
  page-navigation/state-loss risk.
- **No reset/reload control in the panel header** — tried and removed; reads as "reload the page"
  to a visitor, not "clear this chat."
- **`AI_MODEL` is a Worker secret, not a hardcoded constant** — lets a paid-tier model that starts
  402ing get swapped for a free-tier variant via `wrangler secret put` + redeploy, no code change.
- **Default bubble position** is right-edge, vertically centered (`defaultPosition()` in
  `ChatWidgetCore.ts`), not the more common bottom-right corner.
- **`worker-configuration.d.ts` is generated, not hand-written** — rerun `npm run cf-typegen`
  (from `packages/worker`) after any `wrangler.jsonc` change, never hand-edit it. It's excluded
  from Biome linting in `biome.jsonc` since it's third-party-generated code.

## Testing philosophy

Per `PRD.md` §7: type-checking and a successful build verify the code compiles, not that the
feature works. Playwright E2E against a real running `wrangler dev` instance (not mocks) is the
primary verification method for the full request/response path — this project's original build hit
a real `402 Payment Required` from a paid-tier model that no amount of type-checking would have
caught. When something looks broken end-to-end, `wrangler tail` (live Worker logs) is the fastest
way to tell whether it's a bad-origin rejection, a rate limit, an oversized payload, or an upstream
error — the client-facing error message is intentionally vague and won't tell you which.

Note: `@cloudflare/vitest-pool-workers` (installed version, 0.18.x) does not export `fetchMock`
from `cloudflare:test` the way older docs describe — the worker's unit tests
(`src/index.test.ts`) are scoped to request-flow behavior that doesn't require mocking the
upstream LLM call (origin rejection, preflight, role-whitelist rejection, method rejection); actual
upstream passthrough is covered by the Playwright E2E suite instead, against a real (or
locally-mocked-at-the-HTTP-level) upstream.
