#!/usr/bin/env node
// node scripts/email/stats.mjs
import { query, closePool } from '../../email/lib/db.mjs';

async function main() {
  const byStatus = await query(`select status, count(*)::int as n from subscribers group by status order by status`);
  console.log('By status:');
  for (const row of byStatus.rows) console.log(`  ${row.status}: ${row.n}`);

  const byTag = await query(`select unnest(tags) as tag, count(*)::int as n from subscribers where status = 'active' group by tag order by n desc`);
  console.log('\nActive subscribers by tag:');
  for (const row of byTag.rows) console.log(`  ${row.tag}: ${row.n}`);

  const newThisWeek = await query(`select count(*)::int as n from subscribers where created_at > now() - interval '7 days'`);
  console.log(`\nNew subscribers this week: ${newThisWeek.rows[0].n}`);

  const lastCampaign = await query(
    `select id, subject, segment, status, sent_count, sent_at from campaigns where status = 'sent' order by sent_at desc limit 1`
  );
  if (lastCampaign.rows[0]) {
    const c = lastCampaign.rows[0];
    console.log(`\nLast campaign: ${c.id} ("${c.subject}") sent to ${c.sent_count} (${c.segment}) at ${c.sent_at.toISOString()}`);
  } else {
    console.log('\nNo campaigns sent yet.');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closePool);
