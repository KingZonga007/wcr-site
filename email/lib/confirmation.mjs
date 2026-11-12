import { CONFIG } from './config.mjs';
import { makeToken } from './token.mjs';
import { renderEmail } from './template.mjs';
import { sendEmail } from './send.mjs';
import { logEvent } from './db.mjs';

export const CONFIRM_SUBJECT = 'Confirm your email for West Coast Revival';

export function confirmationMarkdown(confirmUrl) {
  return `## Confirm your email\n\nYou're almost done. Tap the button below to confirm, and you'll start getting new songs, free charts and Worship Is Warfare updates.\n\n[Confirm my email](${confirmUrl}){button}\n\nIf you didn't sign up for this, you can ignore this email.`;
}

// Shared by the live /api/subscribe endpoint and the one-time Netlify Forms
// import script, so a pending subscriber always gets the same confirmation email.
export async function sendConfirmationEmail(subscriber) {
  const token = makeToken(subscriber.id, 'confirm');
  const confirmUrl = `${CONFIG.siteUrl}/api/confirm?token=${encodeURIComponent(token)}`;
  const { html, text } = renderEmail({ campaignId: 'confirm', bodyMarkdown: confirmationMarkdown(confirmUrl) });
  try {
    const { messageId } = await sendEmail({ to: subscriber.email, subject: CONFIRM_SUBJECT, html, text });
    await logEvent(subscriber.id, 'confirmation_sent', { messageId });
  } catch (err) {
    await logEvent(subscriber.id, 'confirmation_send_failed', { error: String(err) });
  }
}
