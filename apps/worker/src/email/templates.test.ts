import { describe, expect, it } from 'vitest';

import { renderEmail } from './templates';

describe('renderEmail', () => {
  it('puts the code in the subject, text and HTML with its expiry', () => {
    const email = renderEmail({
      template: 'sign-in-code',
      to: 'priya@example.com',
      code: '482913',
      expiresInMinutes: 5,
    });
    expect(email.subject).toBe('482913 is your Plan My Event code');
    expect(email.text).toContain('482913');
    expect(email.text).toContain('5 minutes');
    expect(email.html).toContain('482913');
  });
});
