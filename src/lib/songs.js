// Which songs get their own page. A song page needs a chart; the rest are listed in the discography on /songs.
import songs from '../data/songs.json';
export const hasCharts = (s) => !!(s && (s.charts.recording || s.charts.congregational));
export const hasPage = hasCharts;
export const songUrl = (s) => (s && hasPage(s) ? `/songs/${s.slug}` : '/songs#discography');
export const songUrlBySlug = (slug) => songUrl(songs.find((x) => x.slug === slug));
export const paged = songs.filter(hasPage);
export const listed = songs.filter((s) => !hasPage(s));
// Card label for the keys a song's charts come in, e.g. "Key of C" or "Keys of A and C".
export const keyLabel = (s) => {
  const c = s.charts || {};
  const keys = [...new Set([c.recording?.key, c.congregational?.key, ...(c.extras || []).map((e) => e.key)].filter(Boolean))];
  if (!keys.length) return s.key ? `Key of ${s.key}` : '';
  if (keys.length === 1) return `Key of ${keys[0]}`;
  return `Keys of ${keys.slice(0, -1).join(', ')} and ${keys[keys.length - 1]}`;
};
