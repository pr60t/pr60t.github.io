import { loadBlogCollection } from '../src/lib/blog-parser.mjs';

const { posts, errors, warnings, todayIST } = loadBlogCollection({
  includeDraftsAndFuture: true,
});

console.log(`Content validation (Asia/Kolkata today: ${todayIST})`);
console.log(`Found ${posts.length} markdown post(s) in content/blog.`);

for (const w of warnings) {
  console.warn(`WARN  ${w}`);
}

if (errors.length > 0) {
  for (const e of errors) {
    console.error(`ERROR ${e}`);
  }
  console.error(`\nValidation failed with ${errors.length} error(s).`);
  process.exit(1);
}

const publishedCount = posts.filter((p) => !p.draft && !p.isFuture).length;
const draftCount = posts.filter((p) => p.draft).length;
const scheduledCount = posts.filter((p) => !p.draft && p.isFuture).length;

console.log(
  `OK: ${publishedCount} published, ${draftCount} draft(s), ${scheduledCount} future-scheduled.`
);
