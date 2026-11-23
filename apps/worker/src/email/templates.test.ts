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

  it('registration: what they registered for in the event time zone, and the link', () => {
    const email = renderEmail({
      template: 'registration-confirmed',
      to: 'anil@example.com',
      eventName: 'DevFest <Bhopal>',
      guestName: 'Anil',
      url: 'https://app.example.com/i/tok',
      partySize: 2,
      timeZone: 'Asia/Kolkata',
      items: [{ name: 'Flutter workshop', startsAt: '2027-03-10T06:00:00.000Z' }],
      eventStartsOn: '2027-03-10',
      eventEndsOn: '2027-03-11',
    });
    expect(email.subject).toBe("You're registered for DevFest <Bhopal>");
    expect(email.text).toContain('Flutter workshop, Wed, 10 Mar, 11:30 am');
    expect(email.text).toContain('2 people');
    expect(email.html).toContain('href="https://app.example.com/i/tok"');
    expect(email.html).toContain('DevFest &#60;Bhopal&#62;');
  });

  it('registration for the whole event lists its dates', () => {
    const email = renderEmail({
      template: 'registration-confirmed',
      to: 'anil@example.com',
      eventName: 'College Fest',
      guestName: 'Anil',
      url: 'https://app.example.com/i/tok',
      partySize: 1,
      timeZone: 'Asia/Kolkata',
      items: [],
      eventStartsOn: '2027-03-10',
      eventEndsOn: '2027-03-11',
    });
    expect(email.text).toContain('10 Mar 2027 – 11 Mar 2027');
    expect(email.text).toContain('1 person');
  });
});
