# pr60t.github.io

Personal portfolio and Jekyll-style Markdown engineering log of **Arun Bobby (`pr60t`)** — built with Astro, React Three Fiber, GSAP + ScrollTrigger + Lenis, and Pagefind.

## Repository Layout

```text
content/blog/               # Markdown posts (DD-MM-YY-title_with_underscores.md) + assets/
src/
  components/               # SearchModal, BlogList, LatticeShell
  data/profile.ts           # Typed portfolio facts (single source of truth)
  layouts/BaseLayout.astro  # Shell, self-hosted fonts, strict CSP, view transitions
  lib/                      # Blog parser/validator, Shiki theme, Markdown pipeline
  pages/                    # Home, /blog/, /blog/[slug]/, /blog/tags/[tag]/, /og/, /rss.xml, /sitemap, /404
  scene/                    # Persistent R3F RAG Lattice, GLSL shaders, beats, HUD, store
  styles/                   # Design tokens, global layout, blog prose
scripts/
  new-post.mjs              # Scaffold a post with today's IST date
  validate-content.mjs      # Strict filename, date, slug, and YAML validator
public/                     # favicon.svg, robots.txt, poster.svg
.github/workflows/          # deploy.yml (push + 00:30 IST cron) and ci.yml (PR checks + Lighthouse CI)
```

---

## Authoring Guide (Blog)

### 1. Create a new post

```bash
npm run new -- "Canaries in Multi-Tenant RAG"
```

This creates `content/blog/DD-MM-YY-canaries_in_multi_tenant_rag.md` using today's date in `Asia/Kolkata` (UTC+5:30). You can also upload or commit a `.md` file directly via GitHub's web UI.

### 2. Filename convention

- Format: `DD-MM-YY-title_with_underscores.md` (an optional leading hyphen is tolerated, e.g. `-25-11-26-title.md`).
- Two-digit year `YY` maps to `2000 + YY`.
- Slug is derived from the part after the date, lowercased with underscores converted to hyphens (`/blog/<slug>/`).

### 3. Front matter

```yaml
---
date: 25-11-26
title: Canaries in multi-tenant RAG
description: One or two sentences shown in the index, RSS, and social cards.
tags: [rag, security]
draft: false
image: ./assets/cover.png
updated: 26-11-26
---
```

- `date` and `updated` accept `DD-MM-YY` or `YYYY-MM-DD`.
- Long dash delimiter lines (`-----------------`) are normalized automatically to `---`.
- `draft: true` is visible in `npm run dev` and excluded from production builds.
- Future-dated posts (evaluated in `Asia/Kolkata`) remain hidden until their date; the GitHub Pages workflow runs daily at **00:30 IST (`0 19 * * *` UTC)** to publish scheduled posts automatically.
- Missing `title` falls back to the filename (with a warning). Missing `description` falls back to the first paragraph (max 160 chars, with a warning).
- **Build-failing errors** (always naming the offending file): invalid filename/calendar date, duplicate slug, or malformed YAML.

### 4. Markdown features

- **GFM**: tables, task lists, strikethrough, footnotes.
- **Callouts**: `> [!NOTE]`, `> [!WARNING]`, `> [!LEAK]` (coral highlight).
- **Code blocks**: Shiki custom `tenant-lattice` palette theme + copy-to-clipboard button.
- **Math**: `$...$` and `$$...$$` rendered with self-hosted KaTeX.
- **Diagrams**: ```` ```mermaid ```` blocks lazy-load Mermaid only on pages that use them.
- **Co-located images**: place images in `content/blog/assets/` and reference them as `./assets/file.png`.

### 5. Validate locally

```bash
npm run validate:content
```

---

## Deployment Guide (GitHub Pages)

1. Push to `main` in repository `pr60t.github.io`.
2. In GitHub repository **Settings → Pages**, set **Source** to **GitHub Actions**.
3. `.github/workflows/deploy.yml` runs on every push to `main`, manual `workflow_dispatch`, and daily at `19:00 UTC` (`00:30 IST`):
   - `npm ci`
   - `npm run validate:content`
   - `npm audit --audit-level=high`
   - `npm run build` (Astro static build + Pagefind indexing)
   - Uploads and deploys `./dist` via official `actions/upload-pages-artifact@v3` and `actions/deploy-pages@v4`.

### Custom domain (`CNAME`)

1. Add `public/CNAME` containing your domain (e.g. `arunbobby.dev`).
2. Update `site` in `astro.config.mjs` to `https://arunbobby.dev`.

---

## Troubleshooting

- **Search shows "Search index is generated on production build"**: Pagefind indexes `./dist` after `astro build`. Run `npm run build && npm run preview` to test search locally.
- **WebGL scene shows static poster**: Hardware/driver lacks WebGL2 or `detect-gpu` reported tier 0. The site remains fully readable with `/poster.svg`.
- **Content validation fails**: Run `npm run validate:content` to see the exact filename and error (invalid date, duplicate slug, or malformed YAML).
- **Telemetry / `astro check` permissions in restricted environments**: Run with `ASTRO_TELEMETRY_DISABLED=1`.

---

## Android Performance Playbook

- **LCP & Initial JS Budget**: Hero `<h1>` is the LCP element. The 3D chunk (`Canvas.tsx` + Three.js + R3F) is code-split via `DeferredCanvas.tsx` and only loaded after LCP via `requestIdleCallback` (1.2s timeout fallback). Save-Data, `2g`/`3g`, and `prefers-reduced-motion` never autoload WebGL and show an inline `<=6KB` SVG poster + `"Enter 3D"` opt-in button.
- **Quality Tiers & Adaptive Governor (`src/scene/quality.ts`)**: `high` (3,500 points, DPR 2, amber bloom + vignette, `highp`), `mid` (1,800 points, DPR 1.5, fake bloom halo, `mediump`), `low` (900 points, DPR 1, no postprocessing, `mediump`, 45fps cap), and `static`. The `FrameGovernor` ring buffer steps down DPR → points → effects if average FPS drops below 45 for 2s, caps at 30fps after 6s idle on the hero, and pauses via `frameloop="demand"` + `IntersectionObserver` + `visibilitychange`.
- **Adreno / Mali Shader Hygiene**: Zero `discard` in fragment shaders, `gl_PointSize <= 48`, `gl.compileAsync` warm-up before first reveal, and full `webglcontextlost` / `webglcontextrestored` recovery from `sceneStore`.
- **Touch, Dock & System Back**: Native scroll momentum on touch (`Lenis` disabled on coarse pointers), `56svh` sticky stage + `24px`-radius sheets, `24dp` edge exclusion for Android system back swipe, `history.pushState` / `popstate` overlay closing, `56dp` bottom dock (`<500px` landscape left rail), and `@media (horizontal-viewport-segments: 2)` foldable support.
- **PWA & Verification**: Workbox `sw.js` precaches the app shell, `/blog/`, `/offline/`, and icons; `npm run test:android` runs Playwright (`Pixel 7`, `Galaxy S9+ landscape`, `CPU 4x throttle`); Lighthouse CI enforces mobile Performance `>= 90` and `100` Accessibility / Best Practices / SEO.
