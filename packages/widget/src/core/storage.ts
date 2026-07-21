import type { ChatMessage, Position } from './types.js';

const NAMESPACE = 'chatling';

export const STORAGE_KEYS = {
  messages: `${NAMESPACE}:messages`,
  position: `${NAMESPACE}:position`,
  greetedAt: `${NAMESPACE}:greeted-at`,
} as const;

// localStorage can throw in private-browsing/quota-exceeded edge cases, and a
// corrupt/foreign value at any of these keys must not crash the widget on mount.
function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore write failures
  }
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.role === 'user' || candidate.role === 'assistant') &&
    typeof candidate.content === 'string'
  );
}

export function loadMessages(): ChatMessage[] {
  const raw = safeGet(STORAGE_KEYS.messages);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isChatMessage);
  } catch {
    return [];
  }
}

export function saveMessages(messages: ChatMessage[]): void {
  safeSet(STORAGE_KEYS.messages, JSON.stringify(messages));
}

export function loadPosition(): Position | null {
  const raw = safeGet(STORAGE_KEYS.position);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as Position).x === 'number' &&
      typeof (parsed as Position).y === 'number'
    ) {
      return parsed as Position;
    }
    return null;
  } catch {
    return null;
  }
}

export function savePosition(position: Position): void {
  safeSet(STORAGE_KEYS.position, JSON.stringify(position));
}

export function loadGreetedAt(): number {
  const raw = safeGet(STORAGE_KEYS.greetedAt);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function saveGreetedAt(timestamp: number): void {
  safeSet(STORAGE_KEYS.greetedAt, String(timestamp));
}
