export interface CorsEnv {
  ALLOWED_ORIGINS?: string;
}

function parseAllowedOrigins(env: CorsEnv): Set<string> {
  return new Set(
    (env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

/**
 * NOT a security boundary — a non-browser client (curl, a script) can spoof
 * the Origin header trivially. This only stops casual cross-site embedding.
 * The rate limiter is the real abuse control.
 */
export function isOriginAllowed(origin: string | null, env: CorsEnv): boolean {
  if (!origin) return false;
  return parseAllowedOrigins(env).has(origin);
}

// Reflects the request's Origin on every response, including error responses —
// the 403 status is what encodes an origin rejection, not the presence of
// this header. Since the origin check above is not a security boundary,
// there's no security reason to also hide error bodies from disallowed
// origins behind a browser-side CORS block.
export function corsHeaders(origin: string | null): HeadersInit {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

export function handlePreflight(request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request.headers.get('Origin')),
  });
}
