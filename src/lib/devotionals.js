// Devotionals: one JSON file per episode of the morning livestream in src/data/devotionals/<number>.json.
// status "draft" -> only at /devotionals/draft/<draftKey>/ (noindex, not in sitemap).
// status "published" -> the episode page becomes the devotional, at /devotionals/<reference>-<title>/.
import { pageSlug } from './slug.mjs';
const files = import.meta.glob('../data/devotionals/*.json', { eager: true });
export const devotionals = Object.values(files).map((m) => m.default);
export const publishedDevotional = (n) => devotionals.find((d) => d.number === n && d.status === 'published');
export const drafts = () => devotionals.filter((d) => d.status === 'draft');
export const epSlug = (ep) => pageSlug(ep, publishedDevotional(ep.number));
export const epPath = (ep) => `/devotionals/${epSlug(ep)}`;
