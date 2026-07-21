import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadGreetedAt,
  loadMessages,
  loadPosition,
  STORAGE_KEYS,
  saveGreetedAt,
  saveMessages,
  savePosition,
} from './storage.js';

beforeEach(() => {
  window.localStorage.clear();
});

describe('loadMessages', () => {
  it('returns an empty array when nothing is stored', () => {
    expect(loadMessages()).toEqual([]);
  });

  it('round-trips messages saved via saveMessages', () => {
    const messages = [{ role: 'user' as const, content: 'hi' }];
    saveMessages(messages);
    expect(loadMessages()).toEqual(messages);
  });

  it('returns an empty array for corrupt JSON instead of throwing', () => {
    window.localStorage.setItem(STORAGE_KEYS.messages, '{not json');
    expect(loadMessages()).toEqual([]);
  });

  it('returns an empty array when the stored value is not an array', () => {
    window.localStorage.setItem(STORAGE_KEYS.messages, JSON.stringify({ foo: 'bar' }));
    expect(loadMessages()).toEqual([]);
  });

  it('filters out entries that are not valid ChatMessage shapes', () => {
    window.localStorage.setItem(
      STORAGE_KEYS.messages,
      JSON.stringify([
        { role: 'user', content: 'ok' },
        { role: 'system', content: 'nope' },
        'garbage',
        {},
      ]),
    );
    expect(loadMessages()).toEqual([{ role: 'user', content: 'ok' }]);
  });
});

describe('loadPosition', () => {
  it('returns null when nothing is stored', () => {
    expect(loadPosition()).toBeNull();
  });

  it('round-trips a position saved via savePosition', () => {
    savePosition({ x: 10, y: 20 });
    expect(loadPosition()).toEqual({ x: 10, y: 20 });
  });

  it('returns null for corrupt JSON instead of throwing', () => {
    window.localStorage.setItem(STORAGE_KEYS.position, 'not json at all');
    expect(loadPosition()).toBeNull();
  });

  it('returns null when x/y are missing or the wrong type', () => {
    window.localStorage.setItem(STORAGE_KEYS.position, JSON.stringify({ x: '10', y: 20 }));
    expect(loadPosition()).toBeNull();
  });
});

describe('loadGreetedAt', () => {
  it('returns 0 when nothing is stored', () => {
    expect(loadGreetedAt()).toBe(0);
  });

  it('round-trips a timestamp saved via saveGreetedAt', () => {
    saveGreetedAt(12345);
    expect(loadGreetedAt()).toBe(12345);
  });

  it('returns 0 for a non-numeric stored value', () => {
    window.localStorage.setItem(STORAGE_KEYS.greetedAt, 'not-a-number');
    expect(loadGreetedAt()).toBe(0);
  });
});

describe('storage failures', () => {
  it('does not throw when localStorage.getItem throws (e.g. private browsing)', () => {
    const spy = vi
      .spyOn(Object.getPrototypeOf(window.localStorage), 'getItem')
      .mockImplementation(() => {
        throw new DOMException('blocked');
      });
    expect(() => loadMessages()).not.toThrow();
    expect(loadMessages()).toEqual([]);
    spy.mockRestore();
  });

  it('does not throw when localStorage.setItem throws (e.g. quota exceeded)', () => {
    const spy = vi
      .spyOn(Object.getPrototypeOf(window.localStorage), 'setItem')
      .mockImplementation(() => {
        throw new DOMException('quota exceeded');
      });
    expect(() => saveMessages([{ role: 'user', content: 'hi' }])).not.toThrow();
    spy.mockRestore();
  });
});
