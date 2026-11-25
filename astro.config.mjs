import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

// User site: https://pr60t.github.io
// For a custom domain, add public/CNAME with your domain name and update `site` below.
export default defineConfig({
  site: 'https://pr60t.github.io',
  base: '/',
  output: 'static',
  integrations: [
    react(),
    sitemap(),
  ],
  vite: {
    build: {
      chunkSizeWarningLimit: 900,
    },
  },
});
