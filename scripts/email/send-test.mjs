#!/usr/bin/env node
// node scripts/email/send-test.mjs <campaign-id>
// Sends one campaign to TEST_RECIPIENTS right now, regardless of its segment
// or send_at. Never touches the campaigns or sends tables.
import { loadCampaignFiles } from '../../email/lib/content.mjs';
import { renderEmail } from '../../email/lib/template.mjs';
import { sendEmail } from '../../email/lib/send.mjs';
import { CONFIG } from '../../email/lib/config.mjs';
import { sleep } from '../../email/lib/sendGuard.mjs';
import { closePool } from '../../email/lib/db.mjs';

const campaignId = process.argv[2];

async function main() {
  if (!campaignId) {
    console.error('Usage: node scripts/email/send-test.mjs <campaign-id>');
    process.exitCode = 1;
    return;
  }
  const file = loadCampaignFiles().find((f) => f.id === campaignId);
  if (!file) {
    console.error(`No campaign file found with id "${campaignId}" in emails/campaigns/`);
    process.exitCode = 1;
    return;
  }
  if (!CONFIG.testRecipients.length) {
    console.error('TEST_RECIPIENTS is empty. Set it before sending a test.');
    process.exitCode = 1;
    return;
  }

  const unsubscribeUrl = `${CONFIG.siteUrl}/api/unsubscribe?token=test-send-not-a-real-subscriber`;
  const { html, text } = renderEmail({ campaignId: file.id, bodyMarkdown: file.body, meta: file.meta, unsubscribeUrl });

  for (const to of CONFIG.testRecipients) {
    await sendEmail({ to, subject: `[TEST] ${file.subject}`, html, text, unsubscribeUrl });
    console.log(`Sent test to ${to}`);
    await sleep(550);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closePool);
