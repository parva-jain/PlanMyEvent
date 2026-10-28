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
  }
}
