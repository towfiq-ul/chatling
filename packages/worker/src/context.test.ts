import { describe, expect, it } from 'vitest';
import { SYSTEM_CONTEXT } from './context.js';

describe('SYSTEM_CONTEXT', () => {
  it('concatenates RULESET.md before the site-specific context', () => {
    expect(SYSTEM_CONTEXT).toContain('GROUNDING & TRUTH');
    expect(SYSTEM_CONTEXT).toContain('SITE_CONTEXT'.replace('SITE_CONTEXT', '## About'));
    expect(SYSTEM_CONTEXT.indexOf('GROUNDING & TRUTH')).toBeLessThan(
      SYSTEM_CONTEXT.indexOf('## About'),
    );
  });

  it('instructs the model to reply in plain text, matching the textContent-only renderer', () => {
    expect(SYSTEM_CONTEXT.toLowerCase()).toContain('plain text only');
  });
});
