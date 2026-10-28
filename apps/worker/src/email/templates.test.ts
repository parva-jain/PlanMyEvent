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

  it('member invite: link, inviter and event, with names escaped in HTML', () => {
    const email = renderEmail({
      template: 'member-invite',
      to: 'rahul@example.com',
      eventName: 'Sharma <Wedding>',
      inviterName: 'Priya',
      url: 'https://app.example.com/join/abc123',
      expiresAt: '2026-11-04T10:00:00.000Z',
    });
    expect(email.subject).toBe('Priya invited you to plan Sharma <Wedding>');
    expect(email.text).toContain('https://app.example.com/join/abc123');
    expect(email.text).toContain('4 Nov 2026');
    expect(email.html).toContain('href="https://app.example.com/join/abc123"');
    expect(email.html).toContain('Sharma &#60;Wedding&#62;');
    expect(email.html).not.toContain('<Wedding>');
  });
});
