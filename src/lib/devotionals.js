// Devotionals: one JSON file per Worship Is Warfare episode in src/data/devotionals/<number>.json.
// status "draft" -> only at /worship-is-warfare/draft/<draftKey>/ (noindex, not in sitemap).
// status "published" -> the episode page becomes the devotional.
const files = import.meta.glob('../data/devotionals/*.json', { eager: true });
export const devotionals = Object.values(files).map((m) => m.default);
export const publishedDevotional = (n) => devotionals.find((d) => d.number === n && d.status === 'published');
export const drafts = () => devotionals.filter((d) => d.status === 'draft');
