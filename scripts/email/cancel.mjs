#!/usr/bin/env node
// node scripts/email/cancel.mjs <campaign-id>
import { query, closePool } from '../../email/lib/db.mjs';

const campaignId = process.argv[2];

async function main() {
  if (!campaignId) {
    console.error('Usage: node scripts/email/cancel.mjs <campaign-id>');
    process.exitCode = 1;
    return;
  }
  const { rows } = await query(
    `update campaigns set status = 'canceled' where id = $1 and status = 'scheduled' returning id`,
    [campaignId]
  );
  if (rows[0]) {
    console.log(`Canceled ${campaignId}.`);
  } else {
    const existing = await query('select status from campaigns where id = $1', [campaignId]);
    console.error(
      existing.rows[0]
        ? `Can't cancel ${campaignId}: it's already "${existing.rows[0].status}".`
        : `No campaign found with id "${campaignId}".`
    );
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closePool);
