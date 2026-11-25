import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { generateSW } from 'workbox-build';

function writePngIcon(svg, outPath, size) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } });
  fs.writeFileSync(outPath, resvg.render().asPng());
}

const standardSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <rect width="512" height="512" rx="96" fill="#0A2A2D"/>
  <rect x="96" y="116" width="168" height="168" stroke="#FFB547" stroke-width="18"/>
  <rect x="172" y="172" width="168" height="168" stroke="#F4E9D3" stroke-width="14"/>
  <rect x="248" y="228" width="168" height="168" stroke="#7FB8BC" stroke-width="14"/>
  <circle cx="256" cy="256" r="24" fill="#FFB547"/>
</svg>`;

// Keyhole sun inside 80% safe zone (center 256,256; safe radius ~204px)
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <rect width="512" height="512" fill="#0A2A2D"/>
  <circle cx="256" cy="224" r="88" stroke="#FFB547" stroke-width="20"/>
  <path d="M224 294 L208 386 L304 386 L288 294" stroke="#F4E9D3" stroke-width="18" stroke-linejoin="round"/>
  <circle cx="256" cy="224" r="28" fill="#FFB547"/>
</svg>`;

const distDir = path.resolve(process.cwd(), 'dist');
const publicDir = path.resolve(process.cwd(), 'public');

for (const dir of [publicDir, distDir]) {
  if (!fs.existsSync(dir)) continue;
  writePngIcon(standardSvg, path.join(dir, 'pwa-192.png'), 192);
  writePngIcon(standardSvg, path.join(dir, 'pwa-512.png'), 512);
  writePngIcon(maskableSvg, path.join(dir, 'pwa-maskable-512.png'), 512);
}

if (fs.existsSync(distDir)) {
  const { count, size } = await generateSW({
    globDirectory: distDir,
    globPatterns: [
      'index.html',
      'blog/index.html',
      'offline/index.html',
      'manifest.webmanifest',
      'favicon.svg',
      'poster.svg',
      'pwa-*.png',
    ],
    swDest: path.join(distDir, 'sw.js'),
    skipWaiting: false,
    clientsClaim: true,
    cleanupOutdatedCaches: true,
    navigateFallback: '/offline/index.html',
    navigateFallbackDenylist: [/^\/pagefind\//, /^\/og\//, /^\/rss\.xml$/],
    runtimeCaching: [
      {
        urlPattern: /\/_astro\/.*\.(?:js|css|woff2|png|svg)$/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'astro-hashed-assets',
          expiration: { maxEntries: 80, maxAgeSeconds: 30 * 24 * 60 * 60 },
        },
      },
      {
        urlPattern: /\/blog\/.*/,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'blog-posts',
          expiration: { maxEntries: 60, maxAgeSeconds: 14 * 24 * 60 * 60 },
        },
      },
    ],
  });
  console.log(`Workbox sw.js generated: ${count} precached files (${size} bytes).`);
}
