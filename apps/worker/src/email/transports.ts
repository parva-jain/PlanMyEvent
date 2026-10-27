import nodemailer from 'nodemailer';
import { Resend } from 'resend';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** One way to deliver email; chosen by EMAIL_TRANSPORT. */
export interface EmailTransport {
  send(message: EmailMessage): Promise<void>;
}

export const EMAIL_TRANSPORT = Symbol('EMAIL_TRANSPORT');

/** SMTP: Mailpit locally (catches everything, inbox at localhost:8025), or any SMTP server. */
export function smtpTransport(url: string, from: string): EmailTransport {
  const transporter = nodemailer.createTransport(url);
  return {
    async send(message) {
      await transporter.sendMail({ from, ...message });
    },
  };
}

/** Resend's HTTP API (production, SystemDesign). */
export function resendTransport(apiKey: string, from: string): EmailTransport {
  const resend = new Resend(apiKey);
  return {
    async send(message) {
      const { error } = await resend.emails.send({ from, ...message });
      if (error) {
        // Thrown so BullMQ retries with back-off (SystemDesign 5.3).
        throw new Error(`Resend rejected the email: ${error.name}: ${error.message}`);
      }
    },
  };
}
