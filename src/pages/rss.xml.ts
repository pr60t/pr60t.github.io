import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { PROFILE } from '@/data/profile';
import { getAllPosts } from '@/lib/blog';

export function GET(context: APIContext) {
  const posts = getAllPosts();
  return rss({
    title: `${PROFILE.name} (${PROFILE.handle}) — Engineering Log`,
    description: `${PROFILE.role}. ${PROFILE.heroSub}`,
    site: context.site ?? 'https://pr60t.github.io',
    items: posts.map((post) => ({
      title: post.title,
      pubDate: new Date(`${post.dateISO}T00:00:00+05:30`),
      description: post.description,
      link: `/blog/${post.slug}/`,
      categories: [...post.tags],
    })),
    customData: '<language>en-us</language>',
  });
}
