import { CONFIG } from './config.mjs';
import { makeToken } from './token.mjs';
import { renderEmail } from './template.mjs';
import { sendEmail } from './send.mjs';
import { logEvent } from './db.mjs';

const CONFIRM_NOTE = "You're almost done. Click the link below to confirm, and you'll get the chart link and future WCR emails.";

// Shared by the live /api/subscribe endpoint and the one-time Netlify Forms
// import script, so a pending subscriber always gets the same confirmation email.
export async function sendConfirmationEmail(subscriber) {
  const token = makeToken(subscriber.id, 'confirm');
  const confirmUrl = `${CONFIG.siteUrl}/api/confirm?token=${encodeURIComponent(token)}`;
  const { html, text } = renderEmail({
    campaignId: 'confirm',
    bodyMarkdown: `## Confirm your email\n\n${CONFIRM_NOTE}\n\n[Confirm my email](${confirmUrl}){button}\n\nIf you didn't sign up for this, you can ignore this email.`,
  });
  try {
    const { messageId } = await sendEmail({ to: subscriber.email, subject: 'Confirm your email — West Coast Revival', html, text });
    await logEvent(subscriber.id, 'confirmation_sent', { messageId });
  } catch (err) {
    await logEvent(subscriber.id, 'confirmation_send_failed', { error: String(err) });
  }
}
