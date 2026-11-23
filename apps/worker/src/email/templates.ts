import type { EmailJob } from '@pme/contracts';

import type { EmailMessage } from './transports';

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** Plain, readable HTML: one column, system fonts, the brand indigo for the code. */
function layout(body: string): string {
  return `<!doctype html><html><body style="margin:0;padding:32px 16px;background:#f2f3fb;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#12142b">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #dcdff0;border-radius:16px;padding:32px">
<p style="margin:0 0 24px;font-weight:700;font-size:18px">Plan My Event</p>
${body}
</div></body></html>`;
}

/** "Sat, 14 Nov, 11:30 am" in the event's time zone. */
const sessionTime = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(new Date(iso));

/** "10 Mar 2027", or "10 Mar 2027 – 11 Mar 2027". */
const eventDates = (startsOn: string, endsOn: string) => {
  const format = (date: string) =>
    new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(date));
  return startsOn === endsOn ? format(startsOn) : `${format(startsOn)} – ${format(endsOn)}`;
};

/**
 * Email content per template. English only for now; Hindi arrives with the web app's
 * translations (CLAUDE.md: India-first, Hindi later).
 */
export function renderEmail(job: EmailJob): Omit<EmailMessage, 'to'> {
  switch (job.template) {
    case 'sign-in-code': {
      const code = escape(job.code);
      const minutes = job.expiresInMinutes;
      return {
        subject: `${job.code} is your Plan My Event code`,
        text: `Your sign-in code is ${job.code}. It expires in ${minutes} minutes.\n\nIf you didn't try to sign in, you can ignore this email.`,
        html: layout(`<p style="margin:0 0 16px;font-size:15px;line-height:24px">Use this code to sign in:</p>
<p style="margin:0 0 16px;font-size:32px;font-weight:700;letter-spacing:8px;color:#4338ca">${code}</p>
<p style="margin:0 0 16px;font-size:15px;line-height:24px">It expires in ${minutes} minutes.</p>
<p style="margin:0;font-size:13px;line-height:20px;color:#5e6384">If you didn't try to sign in, you can ignore this email.</p>`),
      };
    }
    case 'member-invite': {
      const inviter = escape(job.inviterName);
      const event = escape(job.eventName);
      const expires = new Intl.DateTimeFormat('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
      }).format(new Date(job.expiresAt));
      return {
        subject: `${job.inviterName} invited you to plan ${job.eventName}`,
        text: `${job.inviterName} invited you to join the team planning ${job.eventName} on Plan My Event.\n\nJoin here: ${job.url}\n\nThe link works until ${expires}. If you weren't expecting this, you can ignore this email.`,
        html: layout(`<p style="margin:0 0 16px;font-size:15px;line-height:24px"><strong>${inviter}</strong> invited you to join the team planning <strong>${event}</strong>.</p>
<p style="margin:0 0 24px"><a href="${escape(job.url)}" style="display:inline-block;background:#4338ca;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:10px">Join the team</a></p>
<p style="margin:0 0 16px;font-size:13px;line-height:20px;color:#5e6384">The link works until ${expires}.</p>
<p style="margin:0;font-size:13px;line-height:20px;color:#5e6384">If you weren't expecting this, you can ignore this email.</p>`),
      };
    }
    case 'registration-confirmed': {
      const lines = job.items.length
        ? job.items.map((item) => `${item.name}, ${sessionTime(item.startsAt, job.timeZone)}`)
        : [eventDates(job.eventStartsOn, job.eventEndsOn)];
      const people = job.partySize === 1 ? '1 person' : `${job.partySize} people`;
      return {
        subject: `You're registered for ${job.eventName}`,
        text: `Hi ${job.guestName},\n\nYou're registered for ${job.eventName} (${people}):\n${lines.map((line) => `- ${line}`).join('\n')}\n\nView or cancel your registration: ${job.url}\n\nKeep this link to yourself: anyone with it can change your registration.`,
        html: layout(`<p style="margin:0 0 16px;font-size:15px;line-height:24px">Hi ${escape(job.guestName)}, you're registered for <strong>${escape(job.eventName)}</strong> (${people}):</p>
<ul style="margin:0 0 24px;padding-left:20px;font-size:15px;line-height:24px">${lines.map((line) => `<li>${escape(line)}</li>`).join('')}</ul>
<p style="margin:0 0 24px"><a href="${escape(job.url)}" style="display:inline-block;background:#4338ca;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:10px">View your registration</a></p>
<p style="margin:0;font-size:13px;line-height:20px;color:#5e6384">Keep this link to yourself: anyone with it can change your registration.</p>`),
      };
    }
  }
}
