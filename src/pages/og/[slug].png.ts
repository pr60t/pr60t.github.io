import fs from 'node:fs';
import path from 'node:path';
import type { APIRoute } from 'astro';
import { createElement as h } from 'react';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { PROFILE } from '@/data/profile';
import { formatDisplayDate, getAllPosts, type BlogPost } from '@/lib/blog';

const spaceGroteskBold = fs.readFileSync(
  path.resolve(
    process.cwd(),
    'node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff'
  )
);

const jetBrainsMonoMedium = fs.readFileSync(
  path.resolve(
    process.cwd(),
    'node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff'
  )
);

export function getStaticPaths() {
  const posts = getAllPosts();
  return posts.map((post) => ({
    params: { slug: post.slug },
    props: { post },
  }));
}

export const GET: APIRoute = async ({ props }) => {
  const { post } = props as { post: BlogPost };
  const dateLabel = formatDisplayDate(post.dateISO);
  const tagLine = post.tags.length > 0 ? post.tags.map((t) => `#${t}`).join('  ') : '#log';

  const tree = h(
    'div',
    {
      style: {
        width: '1200px',
        height: '630px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '64px',
        backgroundColor: '#0A2A2D',
        color: '#F4E9D3',
        border: '2px solid #1C5257',
        fontFamily: 'Space Grotesk',
      },
    },
    h(
      'div',
      {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontFamily: 'JetBrains Mono',
          fontSize: '20px',
          letterSpacing: '0.18em',
          color: '#FFB547',
        },
      },
      h('span', null, `// ${PROFILE.handle.toUpperCase()} ENGINEERING LOG`),
      h('span', null, dateLabel)
    ),
    h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: '22px',
        },
      },
      h(
        'div',
        {
          style: {
            fontSize: '64px',
            fontWeight: 700,
            lineHeight: 1.08,
            letterSpacing: '-0.03em',
            color: '#F4E9D3',
          },
        },
        post.title
      ),
      h(
        'div',
        {
          style: {
            fontSize: '26px',
            lineHeight: 1.45,
            color: '#D9CEB8',
            maxWidth: '960px',
          },
        },
        post.description
      )
    ),
    h(
      'div',
      {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: '24px',
          borderTop: '1px solid #1C5257',
          fontFamily: 'JetBrains Mono',
          fontSize: '20px',
          color: '#7FB8BC',
        },
      },
      h('span', null, `${PROFILE.name} (${PROFILE.handle})`),
      h('span', null, `${tagLine}  •  ${post.readingTimeMinutes} MIN READ`)
    )
  );

  const svg = await satori(tree, {
    width: 1200,
    height: 630,
    fonts: [
      {
        name: 'Space Grotesk',
        data: spaceGroteskBold,
        weight: 700,
        style: 'normal',
      },
      {
        name: 'JetBrains Mono',
        data: jetBrainsMonoMedium,
        weight: 500,
        style: 'normal',
      },
    ],
  });

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1200 },
  });
  const pngBuffer = resvg.render().asPng();

  return new Response(new Uint8Array(pngBuffer), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
