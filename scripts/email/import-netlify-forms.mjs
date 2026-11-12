#!/usr/bin/env node
// One-time import of existing Netlify Forms "signup" submissions into the new
// subscribers table, as pending (they never confirmed through Netlify Forms).
// Run once, locally: NETLIFY_AUTH_TOKEN=... NETLIFY_SITE_ID=... node scripts/email/import-netlify-forms.mjs [--dry-run]
//
// NETLIFY_AUTH_TOKEN: a personal access token from https://app.netlify.com/user/applications
// NETLIFY_SITE_ID: the site's API ID, from Site settings -> General -> Site details
import { normalizeEmail, isValidEmail, tagsFor } from '../../email/lib/subscribers.mjs';
import { sendConfirmationEmail } from '../../email/lib/confirmation.mjs';
import { query, logEvent, closePool } from '../../email/lib/db.mjs';

const DRY_RUN = process.argv.includes('--dry-run');
const AUTH_TOKEN = process.env.NETLIFY_AUTH_TOKEN;
const SITE_ID = process.env.NETLIFY_SITE_ID;
const API = 'https://api.netlify.com/api/v1';

async function netlifyGet(path) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } });
  if (!res.ok) throw new Error(`Netlify API ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function findSignupFormId() {
  const forms = await netlifyGet(`/sites/${SITE_ID}/forms`);
  const form = forms.find((f) => f.name === 'signup');
  if (!form) throw new Error('No "signup" form found on this site.');
  return form.id;
}

async function* allSubmissions(formId) {
  let page = 1;
  for (;;) {
    const batch = await netlifyGet(`/forms/${formId}/submissions?page=${page}&per_page=100`);
    if (!batch.length) return;
    yield* batch;
    page++;
  }
}

async function main() {
  if (!AUTH_TOKEN || !SITE_ID) {
    console.error('Set NETLIFY_AUTH_TOKEN and NETLIFY_SITE_ID before running this.');
    process.exitCode = 1;
    return;
  }

  const formId = await findSignupFormId();
  let seen = 0;
  let imported = 0;
  let skippedExisting = 0;
  let skippedInvalid = 0;

  for await (const submission of allSubmissions(formId)) {
    seen++;
    const data = submission.data || {};
    if (data.company) {
      skippedInvalid++;
      continue;
    }
    const email = normalizeEmail(data.email);
    if (!email || !isValidEmail(email)) {
      skippedInvalid++;
      continue;
    }

    const existing = await query('select id from subscribers where email = $1', [email]);
    if (existing.rows[0]) {
      skippedExisting++;
      continue;
    }

    const source = data.source || 'netlify-import';
    const tags = tagsFor({ musician: data.musician === 'yes', source, event: undefined });

    if (DRY_RUN) {
      console.log(`Would import ${email} (source: ${source}, submitted ${submission.created_at})`);
      imported++;
      continue;
    }

    const inserted = await query(
      `insert into subscribers
         (email, status, source, song, utm_source, utm_medium, utm_campaign, tags,
          consent_text, consent_ip, consent_user_agent, created_at)
       values ($1, 'pending', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       returning *`,
      [
        email,
        source,
        data.song || null,
        data.utm_source || null,
        data.utm_medium || null,
        data.utm_campaign || null,
        tags,
        'About twice a month. Unsubscribe anytime. (imported from the previous Netlify Forms signup)',
        submission.ip || null,
        submission.user_agent || null,
        submission.created_at || new Date().toISOString(),
      ]
    );
    const subscriber = inserted.rows[0];
    await logEvent(subscriber.id, 'imported_from_netlify_forms', { submissionId: submission.id });
    await sendConfirmationEmail(subscriber);
    imported++;
  }

  console.log(
    `${DRY_RUN ? '[dry run] ' : ''}Seen ${seen}, imported ${imported}, already present ${skippedExisting}, skipped (invalid/honeypot) ${skippedInvalid}.`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closePool);
