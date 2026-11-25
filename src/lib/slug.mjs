// URL slugs for devotional pages. Shared by the site and scripts/redirects.mjs.
export const slugify = (s) => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// A published devotional lives at /devotionals/<opening-reference>-<title>/; other episodes keep their episode slug.
export const pageSlug = (ep, dev) => (dev ? slugify(`${dev.opening} ${dev.title}`) : ep.slug);
