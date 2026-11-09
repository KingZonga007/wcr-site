export const PREVIEW = import.meta.env.PUBLIC_PREVIEW === '1';

// Root-relative link that also works in flat-file preview builds.
export function href(p) {
  if (!PREVIEW || /^(https?:|mailto:|#)/.test(p)) return p;
  const [path, hash] = p.split('#');
  const out = path === '/' ? '/index.html' : path.replace(/\/$/, '') + '.html';
  return out + (hash ? '#' + hash : '');
}

export const SITE = {
  name: 'West Coast Revival',
  url: 'https://westcoastrevival.org',
  mission:
    'West Coast Revival (Jonathan and Ryan Baird) exists to magnify Jesus Christ through songs that marry timeless truth with untamed affection.',
  tagline: 'Timeless truth. Untamed affection.',
  credential: 'The writers of "Behold Our God" and the popular adaptation of "All Creatures of Our God and King."',
  give: 'https://secure.ncfgiving.com/GXDonateNow?id=a0UVx000007gBnqMAE', // National Christian Foundation
  email: 'info@westcoastrevival.org', // placeholder until the domain's mailbox exists
  social: {
    spotify: 'https://open.spotify.com/artist/5K4EsfuyB0ltAeK7GmxLT5',
    applePodcasts: 'https://podcasts.apple.com/podcast/id1864799495',
    youtube: 'https://www.youtube.com/@westcoastrevival',
    youtubeLive: 'https://www.youtube.com/@westcoastrevival/streams',
    youtubeSubscribe: 'https://www.youtube.com/@westcoastrevival?sub_confirmation=1',
    podcastRss: 'https://anchor.fm/s/10d3ef9dc/podcast/rss',
  },
  wiw: {
    days: [2, 4], // Tuesday, Thursday
    hour: 6, // 6am MST (Arizona, no daylight saving)
    label: 'Tuesdays and Thursdays, 6am MST',
  },
};
