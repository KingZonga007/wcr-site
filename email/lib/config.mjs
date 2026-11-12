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
  youtubeChannelId: 'UCn1AwCv0hHtSCm_ThfT8LQw',
  youtubeChannel: 'https://www.youtube.com/@westcoastrevival',
  applePodcasts: 'https://podcasts.apple.com/podcast/id1864799495',
  social: [
    { name: 'YouTube', icon: 'icon-youtube.png', url: 'https://www.youtube.com/@westcoastrevival' },
    { name: 'Spotify', icon: 'icon-spotify.png', url: 'https://open.spotify.com/artist/5K4EsfuyB0ltAeK7GmxLT5' },
    { name: 'Apple Podcasts', icon: 'icon-applepodcasts.png', url: 'https://podcasts.apple.com/podcast/id1864799495' },
  ],
  testRecipients: (process.env.TEST_RECIPIENTS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};
