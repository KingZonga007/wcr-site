import { query, logEvent } from './db.mjs';

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function isValidEmail(email) {
  // Good enough: real validation happens via the confirmation email actually landing.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function tagsFor({ musician, source, event }) {
  const tags = [];
  if (musician) tags.push('musician');
  if (source && source.startsWith('chart-waitlist')) tags.push('chart_waitlist');
  if (event === 'reminder_signup') tags.push('wiw_reminders');
  return tags;
}

// More than 5 attempts from the same IP or email in 10 minutes gets rejected.
// Every attempt is logged first so the count includes the current one.
export async function rateLimited({ ip, email }) {
  await logEvent(null, 'subscribe_attempt', { ip, email });
  const { rows } = await query(
    `select count(*)::int as n from events
     where type = 'subscribe_attempt'
       and created_at > now() - interval '10 minutes'
       and (data->>'ip' = $1 or data->>'email' = $2)`,
    [ip || '', email || '']
  );
  return rows[0].n > 5;
}

// Upserts a subscriber as pending (new) or merges tags/source onto an existing
// one, without ever un-confirming or un-unsubscribing someone by accident.
export async function upsertSubscriber({
  email,
  firstName,
  source,
  song,
  utmSource,
  utmMedium,
  utmCampaign,
  tags,
  consentText,
  consentIp,
  consentUserAgent,
}) {
  const { rows } = await query('select * from subscribers where email = $1', [email]);
  const existing = rows[0];

  if (!existing) {
    const inserted = await query(
      `insert into subscribers
         (email, status, first_name, tags, source, song, utm_source, utm_medium, utm_campaign,
          consent_text, consent_ip, consent_user_agent)
       values ($1, 'pending', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       returning *`,
      [email, firstName || null, tags, source || null, song || null, utmSource || null, utmMedium || null, utmCampaign || null, consentText || null, consentIp || null, consentUserAgent || null]
    );
    const row = inserted.rows[0];
    await logEvent(row.id, 'subscribed', { source, song, tags });
    return { subscriber: row, isNew: true };
  }

  const mergedTags = Array.from(new Set([...(existing.tags || []), ...tags]));
  // An unsubscribed address re-subscribing goes back through confirmation.
  const nextStatus = existing.status === 'unsubscribed' ? 'pending' : existing.status;
  const updated = await query(
    `update subscribers set
       tags = $2, source = coalesce($3, source), song = coalesce($4, song),
       utm_source = coalesce($5, utm_source), utm_medium = coalesce($6, utm_medium), utm_campaign = coalesce($7, utm_campaign),
       status = $8,
       unsubscribed_at = case when $8 = 'pending' then null else unsubscribed_at end,
       consent_text = coalesce($9, consent_text), consent_ip = coalesce($10, consent_ip), consent_user_agent = coalesce($11, consent_user_agent)
     where id = $1
     returning *`,
    [existing.id, mergedTags, source || null, song || null, utmSource || null, utmMedium || null, utmCampaign || null, nextStatus, consentText || null, consentIp || null, consentUserAgent || null]
  );
  const row = updated.rows[0];
  await logEvent(row.id, 'resubscribed', { source, song, tags, previousStatus: existing.status });
  return { subscriber: row, isNew: false };
}
