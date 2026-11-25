import fs from 'node:fs';
import path from 'node:path';
import { loadBlogCollection } from './blog-parser.mjs';

export interface BlogPost {
  readonly slug: string;
  readonly filename: string;
  readonly filePath: string;
  readonly title: string;
  readonly description: string;
  readonly dateISO: string;
  readonly updatedISO?: string;
  readonly tags: readonly string[];
  readonly draft: boolean;
  readonly isFuture: boolean;
  readonly image?: string;
  readonly readingTimeMinutes: number;
  readonly body: string;
}

function syncBlogAssets(): void {
  const srcAssets = path.resolve(process.cwd(), 'content/blog/assets');
  const destAssets = path.resolve(process.cwd(), 'public/blog-assets');
  if (!fs.existsSync(srcAssets)) return;
  fs.mkdirSync(destAssets, { recursive: true });
  fs.cpSync(srcAssets, destAssets, { recursive: true });
}

export function getAllPosts(): BlogPost[] {
  syncBlogAssets();
  const includeDraftsAndFuture = import.meta.env.DEV;
  const { posts, errors, warnings } = loadBlogCollection({ includeDraftsAndFuture });

  for (const w of warnings) {
    console.warn(`[blog] ${w}`);
  }

  if (errors.length > 0) {
    throw new Error(`Blog content validation failed:\n${errors.join('\n')}`);
  }

  return posts as BlogPost[];
}

export function getAllTags(posts: readonly BlogPost[]): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const post of posts) {
    for (const tag of post.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => a.tag.localeCompare(b.tag));
}

export function formatDisplayDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y?.slice(2) ?? ''}`;
}
