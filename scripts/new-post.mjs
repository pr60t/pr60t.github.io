import fs from 'node:fs';
import path from 'node:path';
import { getTodayDDMMYY_IST } from '../src/lib/blog-parser.mjs';

const rawTitle = process.argv.slice(2).join(' ').trim();
if (!rawTitle) {
  console.error('Usage: npm run new -- "My Post Title"');
  process.exit(1);
}

const dateStr = getTodayDDMMYY_IST();
const stem = rawTitle
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

if (!stem) {
  console.error('Could not derive a valid ASCII filename stem from title.');
  process.exit(1);
}

const filename = `${dateStr}-${stem}.md`;
const blogDir = path.resolve(process.cwd(), 'content/blog');
fs.mkdirSync(blogDir, { recursive: true });
const outPath = path.join(blogDir, filename);

if (fs.existsSync(outPath)) {
  console.error(`File already exists: ${outPath}`);
  process.exit(1);
}

const template = `---
date: ${dateStr}
title: ${rawTitle}
description: Short one or two sentence summary for the index, RSS, and social cards.
tags: [security]
draft: true
---

Write your post here.
`;

fs.writeFileSync(outPath, template, 'utf8');
console.log(`Created ${path.relative(process.cwd(), outPath)}`);
