export interface SanitizedChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SanitizedChatRequest {
  messages: SanitizedChatMessage[];
  temperature?: number;
  max_tokens?: number;
}

export type SanitizeResult =
  | { ok: true; value: SanitizedChatRequest }
  | { ok: false; error: string };

export const MAX_MESSAGES = 50;
export const MAX_MESSAGE_CHARS = 8000;
export const MAX_TOTAL_CHARS = 24000;
export const MAX_TOKENS_CAP = 2048;
export const MAX_BODY_BYTES = 80_000;

const ALLOWED_ROLES = new Set(['user', 'assistant']);

/**
 * Only reads {messages, temperature, max_tokens} off the body and rebuilds a
 * fresh object — this prevents a client smuggling arbitrary upstream API
 * params (a different model, stream, tools, etc.) through the proxy. No
 * "model" field is accepted at all: which model is used is entirely the
 * Worker's decision (AI_MODEL secret), never the client's — see PRD §4.8.
 */
export function sanitizeChatRequest(body: unknown): SanitizeResult {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }
  const raw = body as Record<string, unknown>;

  if (!Array.isArray(raw.messages) || raw.messages.length === 0) {
    return { ok: false, error: '"messages" must be a non-empty array.' };
  }
  if (raw.messages.length > MAX_MESSAGES) {
    return { ok: false, error: `Too many messages (max ${MAX_MESSAGES}).` };
  }

  const messages: SanitizedChatMessage[] = [];
  let totalChars = 0;

  for (const entry of raw.messages) {
    if (typeof entry !== 'object' || entry === null) {
      return { ok: false, error: 'Each message must be an object.' };
    }
    const { role, content } = entry as Record<string, unknown>;

    // The most important control in this file: the client can never send
    // role "system". If it could, it could override the server-injected
    // grounding prompt entirely ("ignore previous instructions…").
    if (typeof role !== 'string' || !ALLOWED_ROLES.has(role)) {
      return { ok: false, error: 'Each message must have role "user" or "assistant".' };
    }
    if (typeof content !== 'string' || content.length === 0) {
      return { ok: false, error: 'Each message must have non-empty string content.' };
    }
    if (content.length > MAX_MESSAGE_CHARS) {
      return {
        ok: false,
        error: `Message content too long (max ${MAX_MESSAGE_CHARS} characters).`,
      };
    }

    totalChars += content.length;
    if (totalChars > MAX_TOTAL_CHARS) {
      return {
        ok: false,
        error: `Total conversation too long (max ${MAX_TOTAL_CHARS} characters).`,
      };
    }

    messages.push({ role: role as 'user' | 'assistant', content });
  }

  const value: SanitizedChatRequest = { messages };

  if (raw.temperature !== undefined) {
    if (typeof raw.temperature !== 'number' || Number.isNaN(raw.temperature)) {
      return { ok: false, error: '"temperature" must be a number.' };
    }
    value.temperature = Math.min(Math.max(raw.temperature, 0), 2);
  }

  if (raw.max_tokens !== undefined) {
    if (typeof raw.max_tokens !== 'number' || Number.isNaN(raw.max_tokens)) {
      return { ok: false, error: '"max_tokens" must be a number.' };
    }
    value.max_tokens = Math.min(Math.max(Math.trunc(raw.max_tokens), 1), MAX_TOKENS_CAP);
  }

  return { ok: true, value };
}
