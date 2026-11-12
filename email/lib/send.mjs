import { Resend } from 'resend';
import { CONFIG } from './config.mjs';

let client;
function getClient() {
  if (!client) client = new Resend(CONFIG.emailApiKey);
  return client;
}

// One function all sending paths call, so swapping providers later (Postmark, SES)
// means rewriting this file only.
export async function sendEmail({ to, subject, html, text, unsubscribeUrl }) {
  const headers = {};
  if (unsubscribeUrl) {
    headers['List-Unsubscribe'] = `<${unsubscribeUrl}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }
  const { data, error } = await getClient().emails.send({
    from: `${CONFIG.fromName} <${CONFIG.fromEmail}>`,
    to,
    reply_to: CONFIG.replyTo,
    subject,
    html,
    text,
    headers,
  });
  if (error) throw new Error(`sendEmail failed: ${error.message || JSON.stringify(error)}`);
  return { messageId: data?.id };
}
