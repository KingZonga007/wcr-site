#!/usr/bin/env node
// Runs once a day from GitHub Actions. Catches welcome-sequence steps that are
// due but weren't sent right after confirmation (the 3-day cadence guard held
// them back, a previous run failed, etc). Safe to re-run: sendDueSequenceSteps
// reserves each step before sending.
import { query, closePool } from '../../email/lib/db.mjs';
import { sendDueSequenceSteps } from '../../email/lib/sequenceRunner.mjs';

async function main() {
  const { rows } = await query(
    `select id, email from subscribers where status = 'active' and confirmed_at is not null`
  );
  console.log(`Checking ${rows.length} active subscriber(s) for due sequence steps.`);
  let totalSent = 0;
  for (const subscriber of rows) {
    const { sent } = await sendDueSequenceSteps(subscriber.id);
    if (sent.length) {
      console.log(`${subscriber.email}: sent ${sent.join(', ')}`);
      totalSent += sent.length;
    }
  }
  console.log(`Done. ${totalSent} sequence email(s) sent.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closePool);
