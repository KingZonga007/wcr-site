// Single place for sender identity and required env vars. Import this instead of
// reading process.env directly so every part of the emailer agrees.

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const CONFIG = {
  get databaseUrl() {
    return required('DATABASE_URL');
  },
  get emailApiKey() {
    return required('EMAIL_API_KEY');
  },
  get tokenSecret() {
    return required('TOKEN_SECRET');
  },
  get webhookSecret() {
    return required('WEBHOOK_SECRET');
  },
  siteUrl: process.env.SITE_URL || 'https://westcoastrevival.org',
  fromEmail: process.env.FROM_EMAIL || 'news@mail.westcoastrevival.org',
  fromName: 'West Coast Revival',
  replyTo: process.env.REPLY_TO || 'info@westcoastrevival.org',
  address: '264 S Port Dr, Gilbert, AZ 85233',
  testRecipients: (process.env.TEST_RECIPIENTS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};
