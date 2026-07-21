# PRD: Floating AI Assistant Chat Widget

Source of truth for this design: implemented and shipped in `m-tech-org.github.io` (v3, React 19 + TypeScript + Vite, hash-routed, no router library). This document generalizes that implementation into a reusable spec for building the same thing in another static/SPA site.

## 1. Problem statement

A static site (GitHub Pages, Netlify, S3, etc.) wants a visitor-facing AI chat assistant that:

- Is available on every page/route without being re-mounted or losing state on navigation.
- Persists conversation history and its own screen position across page loads.
- Can be dragged anywhere on screen, but a drag must not be misinterpreted as a click (and vice versa).
- Answers only from the site's own real content — no hallucinated services, pricing, or claims.
- Never exposes the LLM provider's API key to the browser.
- Can't be trivially abused to run up API costs by a scripted client hitting the endpoint directly.

Static sites have no server, so "backend" here means a small edge function, not a full application server.

## 2. Non-goals

- No user accounts, no auth, no multi-tenant conversations — this is a single anonymous visitor-facing widget.
- No streaming responses (kept simple: one request, one response, a "Thinking…" state in between).
- No RAG/vector search — grounding is a static system prompt, not a retrieval pipeline. Fine for a site with a few dozen facts; would need revisiting for a large knowledge base.
- No conversation analytics/logging pipeline (Worker only logs to Cloudflare's built-in observability for debugging).

## 3. Architecture

```
Browser (React SPA)                Edge Worker (Cloudflare)              Upstream LLM API
┌─────────────────────┐            ┌──────────────────────┐            ┌──────────────────┐
│ ChatWidget.tsx       │  POST      │ Origin allowlist      │  POST      │ OpenRouter        │
│  - floating bubble   │ ─────────► │ Rate limit (per IP)   │ ─────────► │ /chat/completions │
│  - draggable         │  {messages}│ Sanitize + cap request│ {messages, │ (OpenAI-compatible)│
│  - message panel     │            │ Inject system prompt  │  model,    │                    │
│  - localStorage      │ ◄───────── │ (server-side only)    │  ...}      │                    │
│    persistence       │  {choices} │ Forward, return       │ ◄───────── │                    │
└─────────────────────┘            └──────────────────────┘            └──────────────────┘
```

Three components, each independently deployable:

1. **Frontend widget** — a single React component tree, mounted once outside the page router so it survives navigation.
2. **Edge proxy Worker** — the only thing holding the LLM API key. Stateless, no database.
3. **Upstream LLM API** — any OpenAI-compatible `/chat/completions` endpoint (OpenRouter used here for access to free-tier models during development).

The core architectural decision: **the browser never talks to the LLM API directly.** A static site has nowhere to hide a secret — anything in client JS is public. The Worker exists solely to hold that secret and add abuse controls in front of it.

## 4. Frontend: the widget component

### 4.1 File layout

```
src/components/ai-chat/
  ChatWidget.tsx           # the component
  chat-widget.module.css   # co-located styles (CSS Modules)
src/config/aiChat.ts        # reads VITE_AI_WORKER_URL, exposes isAiChatConfigured()
src/services/aiChat.ts      # sendChatMessage(): fetch wrapper + response shape validation
```

### 4.2 Mounting: surviving route changes with zero extra plumbing

The site uses hash-based routing with no router library — `App.tsx` listens to `hashchange` and switches between page components in a `renderPage()` function. The trick: mount `<ChatWidget />` as a sibling to the routed content, *outside* the switch:

```tsx
return (
  <>
    {renderPage()}
    <Toaster />
    <ChatWidget />
  </>
);
```

Because it's not inside the part of the tree that gets swapped, React never unmounts it on navigation — its internal `useState` (open/closed, messages, position) survives for free, no context provider or global store needed. If you're using React Router instead of hash routing, the equivalent is mounting it as a sibling of `<Routes>`, above/outside the `<Route>` switch, in your root layout.

localStorage persistence (below) is what makes it survive a *hard reload*, not just a route change — the two mechanisms solve different problems and you need both.

### 4.3 State model

```ts
interface Position { x: number; y: number; }

const [isOpen, setIsOpen] = useState(false);
const [messages, setMessages] = useState<ChatMessage[]>(loadMessages);   // lazy init from localStorage
const [input, setInput] = useState('');
const [isLoading, setIsLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
const [position, setPosition] = useState<Position>(() =>
  loadPosition() ? clampPosition(loadPosition()!) : defaultPosition()
);
```

Two `useEffect`s write `messages` and `position` to `localStorage` on every change:

```ts
const STORAGE_KEY_MESSAGES = 'mtech-ai-chat-messages';
const STORAGE_KEY_POSITION = 'mtech-ai-chat-position';

useEffect(() => { localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(messages)); }, [messages]);
useEffect(() => { localStorage.setItem(STORAGE_KEY_POSITION, JSON.stringify(position)); }, [position]);
```

Namespace your storage keys (`mtech-ai-chat-*`) to avoid collisions with anything else in the app using localStorage. Wrap both loaders in try/catch returning a safe default — `localStorage` can throw in private-browsing/quota-exceeded edge cases, and a corrupt/foreign value at that key shouldn't crash the widget on mount.

### 4.4 Drag vs. click: the actual hard part

A floating bubble that's both draggable *and* clickable needs to distinguish "user pressed and released without moving" (open the panel) from "user pressed, dragged, released" (reposition, don't open). Naive `onClick` + `onMouseDown/Move/Up` fights itself. The clean solution is the **Pointer Events API** with a movement threshold and pointer capture:

```ts
const DRAG_THRESHOLD = 6; // px — below this, treat as a click, not a drag
const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);

const handlePointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
  dragState.current = { startX: e.clientX, startY: e.clientY, origX: position.x, origY: position.y, moved: false };
  bubbleRef.current?.setPointerCapture(e.pointerId); // keeps receiving move/up even if pointer leaves the element
};

const handlePointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
  const state = dragState.current;
  if (!state) return;
  const dx = e.clientX - state.startX;
  const dy = e.clientY - state.startY;
  if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) state.moved = true;
  if (state.moved) setPosition(clampPosition({ x: state.origX + dx, y: state.origY + dy }));
};

const handlePointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
  const state = dragState.current;
  bubbleRef.current?.releasePointerCapture(e.pointerId);
  dragState.current = null;
  if (state && !state.moved) setIsOpen((open) => !open); // no movement past threshold => it was a click
};
```

Why this works and simpler approaches don't:
- **Pointer Events, not mouse/touch events** — one code path handles mouse, touch, and pen instead of maintaining parallel handlers.
- **`setPointerCapture`** — without it, dragging fast enough that the cursor leaves the 60px bubble stops delivering `pointermove` events to it, and the drag "sticks."
- **A pixel threshold, not a time threshold** — a slow, deliberate click can take >200ms without moving; a threshold on distance (not duration) is what actually separates the two gestures.
- **CSS `touch-action: none`** on the bubble is required alongside this — otherwise mobile Safari/Chrome will try to scroll the page during a drag gesture before your JS gets the pointer events.

### 4.5 Positioning: clamping and panel placement

The bubble position is stored as raw `{x, y}` in viewport coordinates (`position: fixed`), always clamped inside the viewport with a margin so it can't be dragged off-screen or behind browser chrome:

```ts
const VIEWPORT_MARGIN = 16;
function clampPosition(pos: Position): Position {
  const maxX = window.innerWidth - BUBBLE_SIZE - VIEWPORT_MARGIN;
  const maxY = window.innerHeight - BUBBLE_SIZE - VIEWPORT_MARGIN;
  return {
    x: Math.min(Math.max(pos.x, VIEWPORT_MARGIN), Math.max(maxX, VIEWPORT_MARGIN)),
    y: Math.min(Math.max(pos.y, VIEWPORT_MARGIN), Math.max(maxY, VIEWPORT_MARGIN)),
  };
}
```

Re-clamp on window `resize` too (a saved position from a wide desktop session would otherwise sit off-screen on a phone).

**Default position** (first-time visitor, no saved position yet): right edge, vertically centered — `x = viewport width − bubble size − 24`, `y = (viewport height − bubble size) / 2`. Chosen over the more common bottom-right-corner default because it reads as reachable/inviting mid-page rather than tucked into a corner alongside other page chrome (cookie banners, "back to top" buttons, etc.). Once a visitor drags the bubble, their position persists and overrides this default on every future load.

The message panel doesn't have its own independent position — it's derived from the bubble's position each time it opens, picking above/below and left/right based on available space so it never renders off-screen or upside-down near an edge:

```ts
function computePanelStyle(bubble: Position): CSSProperties {
  const spaceAbove = bubble.y;
  const spaceBelow = window.innerHeight - (bubble.y + BUBBLE_SIZE);
  const top = spaceAbove >= height + PANEL_GAP || spaceAbove > spaceBelow
    ? Math.max(VIEWPORT_MARGIN, bubble.y - height - PANEL_GAP)   // open upward
    : Math.min(window.innerHeight - height - VIEWPORT_MARGIN, bubble.y + BUBBLE_SIZE + PANEL_GAP); // open downward
  // similar left-clamping logic for horizontal placement
}
```

Panel width/height also shrink to fit small viewports: `Math.min(PANEL_WIDTH, vw - VIEWPORT_MARGIN * 2)`.

### 4.6 UX details worth keeping

- **Escape closes the panel** (`keydown` listener scoped to `isOpen`, removed on close/unmount).
- **Auto-focus the input** when the panel opens (`inputRef.current?.focus()`).
- **Auto-scroll to newest message** on every `messages` change while open (`scrollIntoView({ behavior: 'smooth' })` on a sentinel div at the bottom of the list).
- **Enter sends, Shift+Enter newlines** — standard chat input convention, implemented by checking `e.shiftKey` in the `keydown` handler and calling `preventDefault()`.
- **A "not configured" empty state** (see §4.7) instead of a broken/erroring widget when the backend URL isn't set.
- **`prefers-reduced-motion`** respected — panel/greeting open animations, the resize transition, and the bubble hover transform are all disabled under that media query.
- **`aria-label`/`aria-expanded`/`role="dialog"`/`aria-live="polite"`** on the loading indicator — this is a real interactive widget, not decorative chrome, and needs to be operable via keyboard/screen reader.
- **No reset/reload control.** Deliberately omitted — the panel header only has expand and close. A conversation-clearing affordance was tried and removed; if you want one, don't reach for a "reload" icon (it reads as "reload the page" to a visitor, not "clear this chat").

### 4.9 Typing indicator: animated dots, not text

While waiting on a response, show three small dots with a staggered bounce animation instead of a "Thinking…" text label — it reads as "working" at a glance without adding a line of text a screen reader will announce awkwardly mid-conversation-flow. Keep `aria-live="polite"` and an `aria-label` (e.g. `"Assistant is thinking"`) on the wrapping element so it's still announced, just not as literal visible text:

```css
.typingDot {
  width: 6px; height: 6px; border-radius: 50%;
  animation: typingBounce 1.2s infinite ease-in-out;
}
.typingDot:nth-child(2) { animation-delay: 0.15s; }
.typingDot:nth-child(3) { animation-delay: 0.3s; }

@keyframes typingBounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
  30%           { transform: translateY(-4px); opacity: 1; }
}
```

Disable the animation (leave the dots static at reduced opacity) under `prefers-reduced-motion: reduce`.

### 4.10 Full-screen expand/collapse

A `Maximize2`/`Minimize2` toggle in the panel header switches the panel between its normal floating size and a near-full-viewport size (`top`/`left` at `VIEWPORT_MARGIN`, `width`/`height` = viewport minus margins on both axes). This is a **pure state/CSS change** — not the browser's native Fullscreen API (`element.requestFullscreen()`) — specifically so there's no page reload, no loss of `messages`/scroll state, and no risk of the Fullscreen-API permission prompt some browsers show. Verify this with an automated check, not just a screenshot: assert zero `framenavigated` events fire on the page across an expand→collapse cycle, and that message content already in the DOM survives the toggle unchanged.

Implementation notes:
- Expand state is local (`useState`, not persisted) and resets to collapsed whenever the panel closes — it should never surprise a visitor by reopening full-screen from a previous session.
- **Hide the floating bubble while expanded.** With the panel covering the viewport, the bubble has nothing meaningful to do and is redundant with the header's own close/minimize controls — hide it, don't just let it float on top of or behind the expanded panel.
- Give the expanded panel a `top`/`left`/`width`/`height` CSS `transition` so the resize animates smoothly rather than jumping.

### 4.11 First-load greeting popup: a cooldown, not a one-time flag

A small speech-bubble callout appears near the bubble a short delay (~1.2s) after mount, without requiring a click — but "first-load" here means *no conversation has started and the cooldown has elapsed*, not *literally once ever*. The first version of this shipped as a permanent one-time localStorage flag, which turned out to be the wrong model: a visitor who opens the chat once (for any reason, even out of curiosity, before ever seeing the greeting) would permanently lose it. The corrected design records **when the greeting last appeared**, not whether it was ever dismissed, and re-shows it once enough time has passed:

```ts
useEffect(() => {
  if (!configured || messages.length > 0) return;   // skip if already mid-conversation
  const lastShownAt = Number(localStorage.getItem(STORAGE_KEY_GREETED_AT)) || 0;
  if (lastShownAt && Date.now() - lastShownAt < greetingCooldownMs) return; // still within cooldown
  const timer = setTimeout(() => {
    setShowGreeting(true);
    localStorage.setItem(STORAGE_KEY_GREETED_AT, String(Date.now())); // record at SHOW time, not dismiss time
  }, greetingDelayMs);
  return () => clearTimeout(timer);
}, []); // intentionally run once against the initial mount snapshot, not re-evaluated later
```

Two details matter here:
- **The timestamp is written when the greeting actually appears**, not when it's dismissed. If it's written at dismiss-time instead, a visitor who clicks the bubble before the delay elapses (very plausible — curiosity beats a 1.2s timer constantly) burns the cooldown before the greeting ever showed, and it silently never appears again until the next cooldown window. Get this ordering wrong and the feature looks broken with no error anywhere — it just quietly never fires.
- **Cooldown duration and the message text are both configuration, not constants buried in the component.** Expose them from wherever the rest of the widget's runtime config lives (e.g. alongside the backend URL) so a non-engineer editing site copy doesn't need to go spelunking in drag-and-drop pixel math to change the greeting wording, and so the cooldown window (this project uses 30 minutes) is a one-line tuning knob.

Dismissing the popup (clicking it to open the chat, or its own small close button) just hides it — it does not touch the timestamp; the cooldown clock started when it appeared, regardless of how or whether it was dismissed. Position it relative to the bubble the same way the message panel is (§4.5): prefer the side with more room, clamp inside the viewport, and recompute on every render so it tracks the bubble if dragged before being dismissed.

This pairs with the default-position change in §4.5 — a bubble that spawns mid-edge with an inviting greeting reads as more approachable on a first visit than a silent icon tucked in the corner.

### 4.7 Graceful degradation when unconfigured

```ts
// src/config/aiChat.ts
export const aiChatConfig = { workerUrl: import.meta.env.VITE_AI_WORKER_URL || '' };
export function isAiChatConfigured(): boolean { return !!aiChatConfig.workerUrl; }
```

The widget always renders — bubble, panel, everything — even with no backend configured (e.g., a fresh clone of the repo with no `.env` yet). `isAiChatConfigured()` gates only the input/send affordances and swaps the empty-state copy for a "not configured yet, email us at X" message. This matters because the widget ships as part of the site bundle; it should never be a build-breaking or visibly-broken dependency for a contributor who hasn't set up the Worker yet.

### 4.8 The fetch wrapper

```ts
// src/services/aiChat.ts
export interface ChatMessage { role: 'user' | 'assistant'; content: string; }

export async function sendChatMessage(messages: ChatMessage[]): Promise<string> {
  const response = await fetch(aiChatConfig.workerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || 'Request failed');
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('Unexpected response from assistant');
  return content;
}
```

Note what's *not* sent: no API key, no model name, no system prompt, no temperature/max_tokens by default — the client only ever sends the conversation's `user`/`assistant` turns. Everything else is the Worker's responsibility. This is a deliberate trust boundary, not an oversight.

## 5. Backend: the edge proxy Worker

### 5.1 Why a Worker (vs. Lambda, Cloud Function, etc.)

Cloudflare Workers were chosen because: zero cold-start-sensitive cost for a low-traffic marketing-site chatbot, a free tier that comfortably covers this workload, a built-in native rate-limiting binding (no external Redis/KV needed), and it deploys independently of the static site's own build/deploy pipeline (GitHub Pages here). Any serverless HTTP function platform works architecturally the same way — Workers just made the ops simplest for this project.

### 5.2 Request flow (`workers/ai-proxy/ai-proxy.js`)

```
OPTIONS  → CORS preflight, return 204 immediately, no other checks
POST     → 1. Origin header must be in ALLOWED_ORIGINS, else 403
           2. Required secrets must be present, else 500
           3. If RATE_LIMITER binding present, check per-IP limit, else 429
           4. Content-Length must be under MAX_BODY_BYTES, else 413
           5. Parse + sanitize body (whitelist fields, clamp values), else 400
           6. Forward to upstream LLM API with server-injected system prompt
           7. Return upstream's JSON response verbatim, with CORS headers
other    → 405
```

### 5.3 Security controls, and why each one exists

| Control | Mechanism | Defends against |
|---|---|---|
| Origin allowlist | `Set` of exact origins, checked against `Origin` header | Casual embedding/scraping from other sites. **Not real auth** — a non-browser client (curl, a script) can spoof `Origin` trivially. Documented as such in the code so nobody mistakes it for a security boundary. |
| Rate limiting | Cloudflare `[[ratelimits]]` binding, keyed by `CF-Connecting-IP`, 20 req/60s | The actual abuse boundary — bounds how much of your API budget one IP can burn, regardless of what Origin it claims. Designed to **fail open**: if the binding isn't configured (e.g., local dev, or a platform without it), requests just aren't extra-protected rather than the whole Worker breaking. |
| Body size cap | `Content-Length` check, `MAX_BODY_BYTES = 80_000` | Trivial DoS via giant payloads before you've even parsed JSON. |
| Message count/length caps | `MAX_MESSAGES`, `MAX_MESSAGE_CHARS`, `MAX_TOTAL_CHARS` | A client sending a huge fabricated conversation history to inflate the upstream token bill. |
| Field whitelisting | `sanitizeChatRequest()` only reads `messages`, `temperature`, `max_tokens` off the body and rebuilds a fresh object | Prevents a client smuggling arbitrary OpenAI-API params (e.g., a different `model`, `stream`, `tools`) through the proxy. |
| Role whitelist | `ALLOWED_ROLES = new Set(["user", "assistant"])` | **The most important control.** Blocks a client from ever sending `role: "system"`. If the client could inject a system message, it could override your grounding/guardrails entirely ("ignore previous instructions…") — this closes that off at the proxy, not just via prompt wording. |
| Server-injected system prompt | `messages: [{ role: "system", content: SYSTEM_CONTEXT }, ...safeMessages]` | The grounding content is fixed server-side and the client literally cannot append, replace, or see it change per-request. |
| Value clamping | `temperature` clamped to `[0, 2]`, `max_tokens` clamped to `[1, MAX_TOKENS_CAP]` | A client requesting `max_tokens: 999999` inflating cost per response. |
| Upstream timeout | `AbortSignal.timeout(30_000)` on the fetch to the LLM API | A hung upstream request holding the Worker (and the visitor's UI) open indefinitely. |
| Secrets never in code/config | `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` all set via `wrangler secret put`, never in `wrangler.toml` or source | Standard secret hygiene — `wrangler.toml` is typically committed to the repo. |

### 5.4 Why the model ID is a secret, not a constant

Initially `AI_MODEL` was hardcoded in source. Moved to a Worker secret so the model can be swapped (e.g., from a free-tier to a paid one, or to a newer release) with `wrangler secret put AI_MODEL` + redeploy — no source change, no PR, no rebuild of the frontend. This turned out to matter in practice: development hit a `402 Payment Required` from the upstream provider because the chosen model was a paid variant on an account with no credits ("This request requires more credits... You requested up to 1024 tokens, but can only afford 440."). The fix was switching to the same model family's free-tier variant (OpenRouter suffixes these `:free`) — a one-line secret change, redeployed in seconds, no code touched. **Lesson: verify a chosen model ID is actually free-tier-accessible on your account before wiring it in** — query the provider's `/models` list and filter for the free suffix/flag rather than assuming.

### 5.5 The system prompt: split persona rules from grounding data

The system prompt is assembled from **two files with different jobs and different change frequency**, not one big string:

- **`RULESET.md`** — persona, tone, and behavior rules: who the assistant is, how it talks, what it must always/never do. Changes rarely (only when you want the assistant to *behave* differently).
- **`context.js`**'s `SITE_CONTEXT` — the actual grounding data: services, projects, contact info. Changes whenever the site's real content changes.

Keeping these separate matters because they have different authors and different update cadences in practice — a copy-editing pass on tone shouldn't risk touching the facts, and a new project announcement shouldn't require reading through etiquette rules to find where to add it. It also makes the ruleset portable: it's the one file you'd hand to someone building the *next* site's assistant, unchanged.

`RULESET.md` is structured in fixed sections (adapt the specifics per project, keep the shape):

```markdown
## IDENTITY & ROLE
- Who the assistant is, whose site it's on, what it's for.

## ABBREVIATION & MEANING
- Any acronyms your grounding data uses that the model should expand correctly
  (e.g. RBAC, SaaS, JWT) rather than guess at.

## GROUNDING & TRUTH (STRICT CONTEXT RULE)
- Rule 1: Only answer from the provided context.
- Rule 2: exact fallback line to use when the answer isn't in context (name a
  real contact channel, don't just say "I don't know").
- Rule 3: never invent projects/clients/pricing/capabilities.

## ETIQUETTE & SOFT SKILLS
- Tone, a no-abuse rule, and one scripted de-escalation line for rude input.

## COMMUNICATION GUIDELINES
- Answer length, and — important, easy to get wrong — whether the chat UI
  actually renders Markdown. If it doesn't (plain `{message.content}` in a
  `<div>`, as here), the ruleset must say "plain text only, no **bold** or
  `[links](url)`" or the model will confidently emit syntax that shows up as
  literal asterisks and brackets to the visitor.

### Contact Intent Handling
- What to say when asked to get in touch / about pricing / when thanked.
```

That Markdown-rendering line is a real, non-obvious gotcha worth calling out: an AI model asked to write "clear, well-formatted answers" will default to Markdown conventions (bold, headers, bullet lists with `-`/`*`) unless told not to. If your chat panel renders `message.content` as plain text (no Markdown parser), those conventions show up as literal `**`/`#`/`[]` characters in the UI. Either add a Markdown renderer to the message bubble, or — simpler, and what this project does — tell the ruleset explicitly that output is plain text only.

**Loading `RULESET.md` without duplicating it into JS:** Cloudflare Workers can import non-JS files as raw text via a `[[rules]]` block in `wrangler.toml`:

```toml
[[rules]]
type = "Text"
globs = ["**/*.md"]
fallthrough = true
```

Then in `context.js`:

```js
import RULESET from "./RULESET.md";   // bundled as a plain string, no fetch/runtime FS access needed

const SITE_CONTEXT = `## About ...
## Services ...
## Projects ...`;

export const SYSTEM_CONTEXT = `${RULESET}\n\n${SITE_CONTEXT}`;
```

This avoids the alternative of pasting the ruleset text into a JS template literal (a second copy that silently drifts from the "canonical" `.md` the moment someone edits one but not the other) — there's exactly one copy of the ruleset, and it's a plain Markdown file anyone can review or edit without touching JS. `SITE_CONTEXT` remains the one deliberate manual-sync point (see §5.6 file layout) — it can't be auto-generated from the site's own data files because the Worker doesn't share a build step with the frontend, but a `.md` text import at least removes *that* duplication for the ruleset half.

### 5.6 Worker file layout

```
workers/ai-proxy/
  ai-proxy.js           # request handling, sanitization, CORS
  RULESET.md              # persona/tone/behavior rules — imported as text into context.js
  context.js             # imports RULESET.md, defines SITE_CONTEXT (data), exports SYSTEM_CONTEXT
  wrangler.toml           # Worker name, rate-limit binding, [[rules]] text-import config, observability
  .dev.vars.example       # template for local secrets (gitignored: .dev.vars)
  README.md               # deploy + local dev instructions
```

`wrangler.toml` rate-limit binding (Cloudflare-native, no external KV/Redis):

```toml
[[ratelimits]]
name = "RATE_LIMITER"
namespace_id = "1001"
simple = { limit = 20, period = 60 }
```

## 6. Deployment and configuration

### 6.1 Environment variables

| Name | Where | Purpose |
|---|---|---|
| `VITE_AI_WORKER_URL` | Frontend build env (`.env` locally, GitHub Actions repo secret in CI) | Tells the widget where to POST. Absent → widget renders in "not configured" mode. |
| `AI_API_KEY` | Worker secret (`wrangler secret put`) | Upstream LLM provider key. Never touches the browser. |
| `AI_BASE_URL` | Worker secret | e.g. `https://openrouter.ai/api/v1` — lets you swap providers without a code change. |
| `AI_MODEL` | Worker secret | e.g. `nvidia/nemotron-3-ultra-550b-a55b:free` — see §5.4 on why this is a secret. |

### 6.2 Deploy sequence (Cloudflare + GitHub Pages example)

1. `wrangler login` once, locally.
2. `wrangler secret put AI_API_KEY`, then `AI_BASE_URL`, then `AI_MODEL` (interactive prompts — never pass secrets as CLI args, which land in shell history).
3. `wrangler deploy` — prints the deployed Worker URL (`https://<name>.<subdomain>.workers.dev`).
4. Add that URL as `VITE_AI_WORKER_URL` in the frontend's local `.env` and as a CI secret (e.g. `gh secret set VITE_AI_WORKER_URL --body "<url>"`), and wire it into the build workflow's env block.
5. Add both the production site origin and `http://localhost:<dev-port>` to the Worker's `ALLOWED_ORIGINS` before deploying.

### 6.3 Local development

```bash
cp workers/ai-proxy/.dev.vars.example workers/ai-proxy/.dev.vars   # fill real values, gitignored
wrangler dev   # serves the Worker locally, default http://localhost:8787
```

Point the frontend's `VITE_AI_WORKER_URL` at the local Worker during development to avoid burning real API calls/rate-limit budget against the deployed one.

### 6.4 Makefile convenience targets (optional but recommended)

```makefile
worker-dev:      cd workers/ai-proxy && wrangler dev
worker-deploy:   cd workers/ai-proxy && wrangler deploy
worker-tail:     cd workers/ai-proxy && wrangler tail       # live logs — see rejected requests in real time
worker-secrets:  cd workers/ai-proxy && wrangler secret put AI_API_KEY && wrangler secret put AI_BASE_URL && wrangler secret put AI_MODEL
```

`worker-tail` is the actual debugging tool of record here — when something looks broken end-to-end, live-tailing the Worker immediately shows whether it's a bad-origin rejection, a rate limit, an oversized payload, or an upstream error, rather than guessing from the browser side.

## 7. Testing approach

Type-checking and a successful build verify the code compiles; they don't verify the feature works. What actually caught the real bug in this build (the `402` from a paid-tier model) was an end-to-end test against the *live deployed* Worker using Playwright:

1. Launch headless Chromium, navigate to the deployed/dev site.
2. Locate the bubble, click it (or send a synthetic pointer down/up with no movement, to test the drag-vs-click logic specifically).
3. Type a real question into the input, send it.
4. Attach response/console listeners *before* sending, so the actual HTTP status and body from the Worker are visible — this is what surfaced the `402` instead of a generic "something went wrong" UI message.
5. Assert the rendered assistant message contains expected, grounded content (e.g., checks it lists real services, not hallucinated ones).
6. Separately test persistence: send a message, reload the page, assert the message is still rendered from localStorage; drag the bubble, reload, assert position persisted.
7. Separately test cross-page persistence: open the chat, navigate via hash change to another page, assert the widget is still open/has the same messages (proves the "mount outside the route switch" approach actually works, not just compiles).

Treat a generic UI error message as insufficient signal — always inspect the actual network response during testing, since the UI intentionally shows a vague message to visitors while the real cause (bad origin, rate limit, upstream auth/payment error, malformed response) is only visible in the response body or Worker logs.

## 8. Known limitations / explicit non-solutions

- **Origin checking is not authentication.** It stops casual cross-site embedding, not a determined scripted caller. The rate limiter is the real abuse boundary; don't rely on origin checks for anything security-critical.
- **No conversation-length eviction beyond the hard caps.** A very long-lived localStorage conversation just keeps growing until `MAX_MESSAGES`/`MAX_TOTAL_CHARS` rejects the next send; there's no automatic trimming of old messages. Fine for a marketing-site FAQ bot, would need addressing for a heavier-use assistant.
- **Grounding content is hand-maintained, not generated.** Drifts from the real site if someone updates services/projects data and forgets to update `context.js`. Acceptable at this content scale (a handful of services/projects); wouldn't be at a larger scale.
- **No streaming.** Whole response arrives at once after a synchronous upstream call, capped by `UPSTREAM_TIMEOUT_MS`. Simpler to implement and secure, at the cost of a "Thinking…" wait instead of token-by-token output.

## 9. Reusing this for a different site

To port this pattern elsewhere, the parts that change are: `ALLOWED_ORIGINS` (your domain), `SYSTEM_CONTEXT` (your content), the design-token CSS variables referenced in `chat-widget.module.css` (swap for your own tokens or hardcode colors), and the mount point in your router (must be a sibling of, not inside, whatever component tree gets swapped on navigation). Everything else — the drag logic, the sanitization/rate-limiting Worker, the localStorage persistence pattern, the panel-placement math — is directly reusable as-is.
