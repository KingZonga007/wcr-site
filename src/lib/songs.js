// Which songs get their own page. A song page needs a chart; the rest are listed in the discography on /songs.
import songs from '../data/songs.json';
export const hasCharts = (s) => !!(s && (s.charts.recording || s.charts.congregational));
export const hasPage = hasCharts;
export const songUrl = (s) => (s && hasPage(s) ? `/songs/${s.slug}` : '/songs#discography');
export const songUrlBySlug = (slug) => songUrl(songs.find((x) => x.slug === slug));
export const paged = songs.filter(hasPage);
export const listed = songs.filter((s) => !hasPage(s));
