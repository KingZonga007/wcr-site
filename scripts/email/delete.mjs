#!/usr/bin/env node
// node scripts/email/delete.mjs <email>
// Removes a subscriber and their send history completely, for a data-deletion request.
import { normalizeEmail } from '../../email/lib/subscribers.mjs';
import { query, closePool } from '../../email/lib/db.mjs';

const email = normalizeEmail(process.argv[2]);

async function main() {
  if (!email) {
    console.error('Usage: node scripts/email/delete.mjs <email>');
    process.exitCode = 1;
    return;
  }
  const { rows } = await query('select id from subscribers where email = $1', [email]);
  if (!rows[0]) {
    console.error(`No subscriber found with email "${email}".`);
    process.exitCode = 1;
    return;
  }
  const id = rows[0].id;
  await query('delete from sends where subscriber_id = $1', [id]);
  await query('delete from events where subscriber_id = $1', [id]);
  await query('delete from subscribers where id = $1', [id]);
  console.log(`Deleted ${email} and all associated send history.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closePool);
