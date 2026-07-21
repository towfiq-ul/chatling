import { describe, expect, it } from 'vitest';
import { corsHeaders, handlePreflight, isOriginAllowed } from './cors.js';

describe('isOriginAllowed', () => {
  it('allows an origin present in the comma-separated list', () => {
    const env = { ALLOWED_ORIGINS: 'https://example.com, https://foo.example.com' };
    expect(isOriginAllowed('https://example.com', env)).toBe(true);
    expect(isOriginAllowed('https://foo.example.com', env)).toBe(true);
  });

  it('rejects an origin not in the list', () => {
    const env = { ALLOWED_ORIGINS: 'https://example.com' };
    expect(isOriginAllowed('https://evil.example.com', env)).toBe(false);
  });

  it('rejects a null origin', () => {
    expect(isOriginAllowed(null, { ALLOWED_ORIGINS: 'https://example.com' })).toBe(false);
  });

  it('rejects everything when ALLOWED_ORIGINS is unset', () => {
    expect(isOriginAllowed('https://example.com', {})).toBe(false);
  });
});

describe('corsHeaders', () => {
  it('reflects a provided origin', () => {
    const headers = new Headers(corsHeaders('https://example.com'));
    expect(headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');
    expect(headers.get('Vary')).toBe('Origin');
  });

  it('omits Access-Control-Allow-Origin when origin is null', () => {
    const headers = new Headers(corsHeaders(null));
    expect(headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('handlePreflight', () => {
  it('always returns 204 regardless of the origin allowlist', () => {
    const request = new Request('https://worker.example/chat', {
      method: 'OPTIONS',
      headers: { Origin: 'https://not-allowed.example' },
    });
    const response = handlePreflight(request);
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://not-allowed.example');
  });
});
