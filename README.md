# chatling

A floating AI chat assistant widget for static sites and SPAs — draggable, persists across
navigation and reloads, answers only from content you provide, and never exposes your LLM
provider's API key to the browser. Framework-agnostic: use it as a `<script>`-tag Custom Element
on a plain HTML page, or call `mount()` directly from React, Vue, or anything else.

The browser never talks to the LLM API directly. A companion Cloudflare Worker (which you deploy
yourself, to your own Cloudflare account) holds the only copy of your API key and adds abuse
controls — origin allowlisting, per-IP rate limiting, request sanitization — in front of it.

See [`PRD.md`](./PRD.md) for the full design rationale behind every non-obvious decision here
(drag-vs-click handling, panel placement math, the greeting-popup cooldown, why the model ID is a
secret, etc.).

## Quick start (consumer)

### 1. Deploy the Worker

The Worker isn't published — you copy `packages/worker` into your own project and deploy it to
your own Cloudflare account, so you control your own API key and rate limits.

```bash
cd packages/worker
cp .dev.vars.example .dev.vars   # fill in real values for local dev, gitignored
```

Edit `src/context.ts`'s `SITE_CONTEXT` with your own site's real content (services, projects,
contact info) — this is the one manual-sync point; it can't be auto-generated since the Worker
doesn't share a build step with your frontend.

Edit `wrangler.jsonc`'s `vars.ALLOWED_ORIGINS` to include your production origin and your local
dev origin (comma-separated).

```bash
wrangler login                    # once, locally
wrangler secret put AI_API_KEY    # interactive prompts — never pass secrets as CLI args
wrangler secret put AI_BASE_URL   # e.g. https://openrouter.ai/api/v1
wrangler secret put AI_MODEL      # see the free-tier-model gotcha below before choosing one
wrangler deploy                   # prints your Worker URL: https://<name>.<subdomain>.workers.dev
```

### 2. Embed the widget

**Zero-build, plain HTML** — a `<script>` tag registers `<chatling-widget>` as a Custom Element:

```html
<script src="https://unpkg.com/chatling/dist/auto-register.global.js"></script>
<chatling-widget
  worker-url="https://your-worker.your-subdomain.workers.dev"
  title="Site Assistant"
  placeholder="Ask a question…"
  theme="auto"
></chatling-widget>
```

**Any JS framework** — call `mount()` directly (needed for callbacks like `onMessage`, which
can't be serialized as an HTML attribute):

```ts
import { mount } from 'chatling';

const instance = mount(document.getElementById('chat-widget-root'), {
  workerUrl: 'https://your-worker.your-subdomain.workers.dev',
  title: 'Site Assistant',
  onMessage: (message) => console.log(message),
});

// later, e.g. on component unmount:
instance.destroy();
```

**Important for SPAs**: mount the widget as a **sibling** of whatever subtree your router swaps
on navigation, not inside it — otherwise the router will unmount and remount it (losing its
open/closed state, messages, and position) on every route change. See
[`examples/react`](./examples/react) for a working example using hash-based navigation, and
[`ChatWidgetMount.tsx`](./examples/react/src/ChatWidgetMount.tsx) for the wrapper pattern.

If `workerUrl` is omitted, the widget still renders (bubble, panel) but shows a "not configured"
message instead of a broken/erroring chat — safe to embed before your Worker is deployed.

## Known caveats

- **Origin allowlisting is not authentication.** `ALLOWED_ORIGINS` stops casual cross-site
  embedding, not a determined scripted caller — the `Origin` header is trivially spoofable by a
  non-browser client (curl, a script). The per-IP rate limiter is the real abuse boundary; don't
  rely on the origin check for anything security-critical.
- **Verify your model is actually free-tier-accessible before wiring it in.** `AI_MODEL` is kept
  as a Worker secret (not a source constant) specifically so it can be swapped with
  `wrangler secret put AI_MODEL` + redeploy, no code change — this matters because a paid-tier
  model on an account with no credits will fail requests with a `402 Payment Required` at request
  time, not at deploy time. Query your provider's `/models` list and filter for the free
  suffix/flag (e.g. OpenRouter uses a `:free` suffix) rather than assuming.

## Repo development

This is an npm workspaces monorepo: `packages/widget` (the publishable package) and
`packages/worker` (the Worker template, unpublished).

```bash
npm install
npm run build        # builds all workspaces
npm run typecheck     # tsc --noEmit per workspace
npm run lint           # biome
npm run format          # biome --write
npm test                # unit tests (Vitest) across workspaces
npm run test:e2e         # Playwright, against a running wrangler dev + examples/vanilla
```

Worker-specific, from `packages/worker`:

```bash
npm run dev      # wrangler dev — local dev server, default http://localhost:8787
npm run deploy   # wrangler deploy
npm run tail     # wrangler tail — live logs, the actual debugging tool of record
```

To try the examples locally:

```bash
# vanilla — plain HTML + script tag, references the built dist/ output directly.
# Serve from the repo root, not examples/vanilla — the page's relative path to
# ../../packages/widget/dist/ would otherwise fall outside the server's root.
npm run build --workspace packages/widget
npx serve .
# then open http://localhost:3000/examples/vanilla/index.html

# React — hash-routed two-page app, widget mounted outside the routed subtree
cd examples/react
npm install
cp .env.example .env.local   # point VITE_AI_WORKER_URL at your local wrangler dev
npm run dev
```
