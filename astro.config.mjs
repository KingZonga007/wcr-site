import { defineConfig } from 'astro/config';

const preview = process.env.PUBLIC_PREVIEW === '1';

export default defineConfig({
  site: 'https://westcoastrevival.org',
  // Preview builds use flat .html files so they work on any static host.
  build: { format: preview ? 'file' : 'directory' },
  trailingSlash: 'ignore',
});
