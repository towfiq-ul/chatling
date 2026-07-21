import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BUBBLE_SIZE,
  ChatWidgetCore,
  clampPosition,
  computeExpandedPlacement,
  computePanelPlacement,
  DRAG_THRESHOLD,
  defaultPosition,
  shouldShowGreeting,
  VIEWPORT_MARGIN,
} from './ChatWidgetCore.js';
import type { ChatMessage } from './types.js';

beforeEach(() => {
  window.localStorage.clear();
});

describe('clampPosition', () => {
  it('keeps a position already inside the viewport unchanged', () => {
    expect(clampPosition({ x: 100, y: 100 }, 1024, 768)).toEqual({ x: 100, y: 100 });
  });

  it('clamps a position past the right/bottom edge', () => {
    const result = clampPosition({ x: 5000, y: 5000 }, 1024, 768);
    expect(result.x).toBe(1024 - BUBBLE_SIZE - VIEWPORT_MARGIN);
    expect(result.y).toBe(768 - BUBBLE_SIZE - VIEWPORT_MARGIN);
  });

  it('clamps a negative position back to the margin', () => {
    expect(clampPosition({ x: -500, y: -500 }, 1024, 768)).toEqual({
      x: VIEWPORT_MARGIN,
      y: VIEWPORT_MARGIN,
    });
  });
});

describe('defaultPosition', () => {
  it('is right edge, vertically centered', () => {
    const pos = defaultPosition(1024, 768);
    expect(pos.x).toBe(1024 - BUBBLE_SIZE - 24);
    expect(pos.y).toBe((768 - BUBBLE_SIZE) / 2);
  });
});

describe('computePanelPlacement', () => {
  it('opens below the bubble when there is more room below than above', () => {
    const placement = computePanelPlacement({ x: 800, y: 20 }, 1024, 768);
    expect(placement.top).toBeGreaterThan(20);
  });

  it('opens above the bubble when there is more room above than below', () => {
    const placement = computePanelPlacement({ x: 800, y: 700 }, 1024, 768);
    expect(placement.top).toBeLessThan(700);
  });

  it('shrinks to fit a small viewport', () => {
    const placement = computePanelPlacement({ x: 100, y: 100 }, 320, 480);
    expect(placement.width).toBeLessThanOrEqual(320 - VIEWPORT_MARGIN * 2);
    expect(placement.height).toBeLessThanOrEqual(480 - VIEWPORT_MARGIN * 2);
  });
});

describe('computeExpandedPlacement', () => {
  it('fills the viewport minus margins', () => {
    const placement = computeExpandedPlacement(1024, 768);
    expect(placement).toEqual({
      top: VIEWPORT_MARGIN,
      left: VIEWPORT_MARGIN,
      width: 1024 - VIEWPORT_MARGIN * 2,
      height: 768 - VIEWPORT_MARGIN * 2,
    });
  });
});

describe('shouldShowGreeting', () => {
  const cooldownMs = 1000;

  it('is true with no prior conversation and no prior greeting', () => {
    expect(shouldShowGreeting(10_000, 0, 0, cooldownMs)).toBe(true);
  });

  it('is false once a conversation has started', () => {
    expect(shouldShowGreeting(10_000, 1, 0, cooldownMs)).toBe(false);
  });

  it('is false while still inside the cooldown window', () => {
    expect(shouldShowGreeting(10_500, 0, 10_000, cooldownMs)).toBe(false);
  });

  it('is true again once the cooldown has elapsed', () => {
    expect(shouldShowGreeting(11_001, 0, 10_000, cooldownMs)).toBe(true);
  });
});

describe('ChatWidgetCore drag-vs-click', () => {
  it('treats a pointer down/up with no movement as a click that opens the panel', () => {
    const core = new ChatWidgetCore({ workerUrl: 'https://example.com/chat' });
    expect(core.getState().isOpen).toBe(false);

    core.onBubblePointerDown(100, 100);
    core.onBubblePointerMove(101, 101);
    const wasClick = core.onBubblePointerUp();

    expect(wasClick).toBe(true);
    expect(core.getState().isOpen).toBe(true);
  });

  it('treats movement past the threshold as a drag, not a click', () => {
    const core = new ChatWidgetCore({ workerUrl: 'https://example.com/chat' });
    const startPosition = core.getState().position;

    core.onBubblePointerDown(100, 100);
    core.onBubblePointerMove(100 + DRAG_THRESHOLD + 5, 100);
    const wasClick = core.onBubblePointerUp();

    expect(wasClick).toBe(false);
    expect(core.getState().isOpen).toBe(false);
    expect(core.getState().position.x).not.toBe(startPosition.x);
  });
});

describe('ChatWidgetCore expand/collapse', () => {
  it('only expands while open, and resets to collapsed on close', () => {
    const core = new ChatWidgetCore({ workerUrl: 'https://example.com/chat' });

    core.toggleExpand();
    expect(core.getState().isExpanded).toBe(false);

    core.open();
    core.toggleExpand();
    expect(core.getState().isExpanded).toBe(true);

    core.close();
    expect(core.getState().isExpanded).toBe(false);
  });
});

describe('ChatWidgetCore.sendMessage', () => {
  it('appends the user and assistant messages and persists them', async () => {
    const transport = vi.fn(async (messages: ChatMessage[]) => {
      expect(messages[messages.length - 1]).toEqual({ role: 'user', content: 'hello' });
      return 'hi there';
    });
    const onMessage = vi.fn();
    const core = new ChatWidgetCore(
      { workerUrl: 'https://example.com/chat', onMessage },
      { transport },
    );

    await core.sendMessage('hello');

    expect(transport).toHaveBeenCalledTimes(1);
    expect(core.getState().messages).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
    ]);
    expect(core.getState().isLoading).toBe(false);
    expect(onMessage).toHaveBeenCalledTimes(2);

    const raw = window.localStorage.getItem('chatling:messages');
    expect(raw && JSON.parse(raw)).toEqual(core.getState().messages);
  });

  it('sets an error and skips the network call when not configured', async () => {
    const transport = vi.fn();
    const onError = vi.fn();
    const core = new ChatWidgetCore({}, { transport });

    await core.sendMessage('hello');

    expect(transport).not.toHaveBeenCalled();
    expect(core.getState().error).toBeTruthy();
    expect(onError).not.toHaveBeenCalled();
  });

  it('records the transport error and calls onError on failure', async () => {
    const transport = vi.fn(async () => {
      throw new Error('network down');
    });
    const onError = vi.fn();
    const core = new ChatWidgetCore(
      { workerUrl: 'https://example.com/chat', onError },
      { transport },
    );

    await core.sendMessage('hello');

    expect(core.getState().error).toBe('network down');
    expect(core.getState().isLoading).toBe(false);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe('ChatWidgetCore greeting cooldown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('shows the greeting after the delay on a first-ever mount', () => {
    const core = new ChatWidgetCore(
      { workerUrl: 'https://example.com/chat', greetingDelayMs: 1000 },
      { now: () => 0 },
    );

    core.start();
    expect(core.getState().showGreeting).toBe(false);

    vi.advanceTimersByTime(1000);
    expect(core.getState().showGreeting).toBe(true);
    expect(window.localStorage.getItem('chatling:greeted-at')).toBe('0');

    core.destroy();
  });

  it('does not schedule a greeting while still inside the cooldown window', () => {
    window.localStorage.setItem('chatling:greeted-at', '500');
    const core = new ChatWidgetCore(
      { workerUrl: 'https://example.com/chat', greetingDelayMs: 1000, greetingCooldownMs: 10_000 },
      { now: () => 1000 },
    );

    core.start();
    vi.advanceTimersByTime(5000);

    expect(core.getState().showGreeting).toBe(false);
    core.destroy();
  });

  it('dismissing the greeting hides it without rewriting the shown-at timestamp', () => {
    const core = new ChatWidgetCore(
      { workerUrl: 'https://example.com/chat', greetingDelayMs: 1000 },
      { now: () => 42 },
    );

    core.start();
    vi.advanceTimersByTime(1000);
    expect(core.getState().showGreeting).toBe(true);

    core.dismissGreeting();
    expect(core.getState().showGreeting).toBe(false);
    expect(window.localStorage.getItem('chatling:greeted-at')).toBe('42');

    core.destroy();
  });
});
