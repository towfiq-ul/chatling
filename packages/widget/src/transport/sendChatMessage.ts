import type { ChatMessage } from '../core/types.js';

export interface SendChatMessageOptions {
  workerUrl: string;
}

/**
 * Posts only the conversation's user/assistant turns — no API key, model,
 * system prompt, or temperature. Everything else is the Worker's responsibility;
 * this is a deliberate trust boundary, not an oversight. No streaming: one
 * request, one response.
 */
export async function sendChatMessage(
  messages: ChatMessage[],
  options: SendChatMessageOptions,
): Promise<string> {
  const response = await fetch(options.workerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error('Received a malformed response from the assistant.');
  }

  if (!response.ok) {
    const message =
      typeof data === 'object' && data !== null && 'error' in data
        ? String((data as { error?: unknown }).error)
        : 'Request failed';
    throw new Error(message);
  }

  const content = (data as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]
    ?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('Unexpected response from assistant.');
  }
  return content;
}
