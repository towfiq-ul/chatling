import { SYSTEM_CONTEXT } from './context.js';
import { corsHeaders, handlePreflight, isOriginAllowed } from './cors.js';
import { MAX_BODY_BYTES, sanitizeChatRequest } from './sanitize.js';

const UPSTREAM_TIMEOUT_MS = 30_000;

function errorResponse(status: number, message: string, origin: string | null): Response {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

export default {
  async fetch(request, env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return handlePreflight(request);
    }

    const origin = request.headers.get('Origin');

    if (request.method !== 'POST') {
      return errorResponse(405, 'Method not allowed.', origin);
    }

    // Not real auth — stops casual cross-site embedding, not a determined
    // scripted caller (Origin is trivially spoofable outside a browser).
    // The rate limiter below is the actual abuse boundary.
    if (!isOriginAllowed(origin, env)) {
      return errorResponse(403, 'Origin not allowed.', origin);
    }

    if (!env.AI_API_KEY || !env.AI_BASE_URL || !env.AI_MODEL) {
      return errorResponse(500, 'Assistant is not configured.', origin);
    }

    // Fails open if the binding isn't configured (e.g. a fresh clone before
    // `wrangler.jsonc` is fully set up) rather than breaking the whole Worker.
    if (env.RATE_LIMITER) {
      const key = request.headers.get('CF-Connecting-IP') ?? 'unknown';
      const { success } = await env.RATE_LIMITER.limit({ key });
      if (!success) {
        return errorResponse(429, 'Too many requests. Please try again shortly.', origin);
      }
    }

    const contentLength = Number(request.headers.get('Content-Length') ?? '0');
    if (contentLength > MAX_BODY_BYTES) {
      return errorResponse(413, 'Request body too large.', origin);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse(400, 'Request body must be valid JSON.', origin);
    }

    const sanitized = sanitizeChatRequest(body);
    if (!sanitized.ok) {
      return errorResponse(400, sanitized.error, origin);
    }

    // The grounding content is fixed server-side and prepended here — the
    // client literally cannot append, replace, or see it change per-request.
    const upstreamMessages = [
      { role: 'system', content: SYSTEM_CONTEXT },
      ...sanitized.value.messages,
    ];

    let upstreamResponse: Response;
    try {
      upstreamResponse = await fetch(`${env.AI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.AI_API_KEY}`,
        },
        body: JSON.stringify({
          model: env.AI_MODEL,
          messages: upstreamMessages,
          ...(sanitized.value.temperature !== undefined && {
            temperature: sanitized.value.temperature,
          }),
          ...(sanitized.value.max_tokens !== undefined && {
            max_tokens: sanitized.value.max_tokens,
          }),
        }),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
    } catch (err) {
      const message =
        err instanceof Error && err.name === 'TimeoutError'
          ? 'The assistant took too long to respond.'
          : 'Failed to reach the assistant provider.';
      return errorResponse(502, message, origin);
    }

    // Passed through verbatim, unbuffered — no need to parse/re-serialize a
    // response we're not transforming.
    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: {
        'Content-Type': upstreamResponse.headers.get('Content-Type') ?? 'application/json',
        ...corsHeaders(origin),
      },
    });
  },
} satisfies ExportedHandler<Env>;
