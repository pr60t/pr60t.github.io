import fs from 'node:fs';
import path from 'node:path';
import { load as parseYaml } from 'js-yaml';

export const FILENAME_REGEX = /^-?(\d{2})-(\d{2})-(\d{2})-([A-Za-z0-9_-]+)\.md$/;

/**
 * Return today's date in Asia/Kolkata (UTC+5:30) as YYYY-MM-DD.
 * @param {Date} [now]
 * @returns {string}
 */
export function getTodayIST(now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(now);
}

/**
 * Format today's date in Asia/Kolkata as DD-MM-YY.
 * @param {Date} [now]
 * @returns {string}
 */
export function getTodayDDMMYY_IST(now = new Date()) {
  const iso = getTodayIST(now);
  const [yyyy, mm, dd] = iso.split('-');
  return `${dd}-${mm}-${yyyy.slice(2)}`;
}

/**
 * Validate a calendar date and return YYYY-MM-DD or null if invalid.
 * @param {number} year
 * @param {number} month 1-12
 * @param {number} day 1-31
 * @returns {string | null}
 */
function toValidISODate(year, month, day) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/**
 * Parse DD-MM-YY or YYYY-MM-DD (or Date instance from js-yaml) into YYYY-MM-DD.
 * @param {unknown} value
 * @returns {string | null}
 */
export function parseFlexibleDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toValidISODate(
      value.getUTCFullYear(),
      value.getUTCMonth() + 1,
      value.getUTCDate()
    );
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();

  const ddmmyy = /^(\d{2})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (ddmmyy) {
    return toValidISODate(2000 + Number(ddmmyy[3]), Number(ddmmyy[2]), Number(ddmmyy[1]));
  }

  const yyyymmdd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (yyyymmdd) {
    return toValidISODate(Number(yyyymmdd[1]), Number(yyyymmdd[2]), Number(yyyymmdd[3]));
  }

  return null;
}

/**
 * Normalize long dash delimiter lines (3+ hyphens) at the start/end of front matter.
 * @param {string} raw
 * @returns {{ hasFrontMatter: boolean; yamlText: string; body: string; unclosed: boolean }}
 */
export function splitFrontMatter(raw) {
  const normalized = raw.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const firstLine = lines[0]?.trim() ?? '';

  if (!/^-{3,}$/.test(firstLine)) {
    return { hasFrontMatter: false, yamlText: '', body: normalized, unclosed: false };
  }

  let endIdx = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (/^-{3,}$/.test((lines[i] ?? '').trim())) {
      endIdx = i;
      break;
    }
  }

  if (endIdx === -1) {
    return { hasFrontMatter: true, yamlText: '', body: normalized, unclosed: true };
  }

  return {
    hasFrontMatter: true,
    yamlText: lines.slice(1, endIdx).join('\n'),
    body: lines.slice(endIdx + 1).join('\n').replace(/^\n+/, ''),
    unclosed: false,
  };
}

/**
 * Strip basic Markdown syntax to produce a plain-text excerpt (<= 160 chars).
 * @param {string} markdown
 * @returns {string}
 */
export function deriveDescription(markdown) {
  const paragraphs = markdown
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p && !p.startsWith('#') && !p.startsWith('```') && !p.startsWith('---'));

  const first = paragraphs[0] ?? '';
  const plain = first
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*_~>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (plain.length <= 160) return plain;
  return `${plain.slice(0, 157).trimEnd()}...`;
}

/**
 * Derive a readable title from the filename stem.
 * @param {string} rawStem
 * @returns {string}
 */
export function deriveTitleFromStem(rawStem) {
  return rawStem
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/**
 * Compute reading time in minutes (minimum 1).
 * @param {string} markdown
 * @returns {number}
 */
export function computeReadingTime(markdown) {
  const words = markdown.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}

/**
 * Parse and validate all blog posts in content/blog.
 * @param {{ contentDir?: string; includeDraftsAndFuture?: boolean; now?: Date }} [options]
 */
export function loadBlogCollection(options = {}) {
  const contentDir = options.contentDir ?? path.resolve(process.cwd(), 'content/blog');
  const includeDraftsAndFuture = options.includeDraftsAndFuture ?? false;
  const todayIST = getTodayIST(options.now);

  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];
  /** @type {Array<any>} */
  const posts = [];
  /** @type {Map<string, string>} */
  const seenSlugs = new Map();

  if (!fs.existsSync(contentDir)) {
    return { posts, errors, warnings, todayIST };
  }

  const entries = fs.readdirSync(contentDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

    const filename = entry.name;
    const filePath = path.join(contentDir, filename);
    const match = FILENAME_REGEX.exec(filename);

    if (!match) {
      errors.push(
        `[${filename}] Invalid filename. Expected DD-MM-YY-title_with_underscores.md (optional leading hyphen).`
      );
      continue;
    }

    const filenameDateISO = toValidISODate(
      2000 + Number(match[1 + 2]),
      Number(match[2]),
      Number(match[1])
    );

    if (!filenameDateISO) {
      errors.push(
        `[${filename}] Invalid calendar date in filename (${match[1]}-${match[2]}-${match[3]}).`
      );
      continue;
    }

    const rawStem = match[4];
    const slug = rawStem.toLowerCase().replace(/_/g, '-');

    const prevFile = seenSlugs.get(slug);
    if (prevFile) {
      errors.push(
        `[${filename}] Duplicate slug "${slug}" (already defined by "${prevFile}").`
      );
      continue;
    }
    seenSlugs.set(slug, filename);

    const rawContent = fs.readFileSync(filePath, 'utf8');
    const { hasFrontMatter, yamlText, body, unclosed } = splitFrontMatter(rawContent);

    if (unclosed) {
      errors.push(`[${filename}] Malformed front matter: missing closing "---" delimiter.`);
      continue;
    }

    /** @type {Record<string, any>} */
    let fm = {};
    if (hasFrontMatter && yamlText.trim().length > 0) {
      try {
        const parsed = parseYaml(yamlText);
        if (parsed !== null && parsed !== undefined) {
          if (typeof parsed !== 'object' || Array.isArray(parsed)) {
            errors.push(`[${filename}] Malformed YAML front matter: expected a key-value mapping.`);
            continue;
          }
          fm = parsed;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`[${filename}] Malformed YAML front matter: ${msg}`);
        continue;
      }
    }

    let dateISO = filenameDateISO;
    if (fm.date !== undefined && fm.date !== null && fm.date !== '') {
      const parsedFmDate = parseFlexibleDate(fm.date);
      if (!parsedFmDate) {
        errors.push(
          `[${filename}] Invalid front matter "date" (${String(fm.date)}). Use DD-MM-YY or YYYY-MM-DD.`
        );
        continue;
      }
      if (parsedFmDate !== filenameDateISO) {
        warnings.push(
          `[${filename}] Front matter date (${parsedFmDate}) differs from filename date (${filenameDateISO}); using front matter date.`
        );
      }
      dateISO = parsedFmDate;
    }

    /** @type {string | undefined} */
    let updatedISO;
    if (fm.updated !== undefined && fm.updated !== null && fm.updated !== '') {
      const parsedUpdated = parseFlexibleDate(fm.updated);
      if (!parsedUpdated) {
        errors.push(
          `[${filename}] Invalid front matter "updated" (${String(fm.updated)}). Use DD-MM-YY or YYYY-MM-DD.`
        );
        continue;
      }
      updatedISO = parsedUpdated;
    }

    let title = typeof fm.title === 'string' ? fm.title.trim() : '';
    if (!title) {
      title = deriveTitleFromStem(rawStem);
      warnings.push(`[${filename}] Missing "title"; derived "${title}" from filename.`);
    }

    let description = typeof fm.description === 'string' ? fm.description.trim() : '';
    if (!description) {
      description = deriveDescription(body);
      warnings.push(`[${filename}] Missing "description"; derived excerpt from first paragraph.`);
    }

    const tags = Array.isArray(fm.tags)
      ? fm.tags
          .map((t) => String(t).trim().toLowerCase())
          .filter(Boolean)
      : [];

    const draft = Boolean(fm.draft);
    const image = typeof fm.image === 'string' && fm.image.trim() ? fm.image.trim() : undefined;
    const isFuture = dateISO > todayIST;
    const readingTimeMinutes = computeReadingTime(body);

    if (!includeDraftsAndFuture && (draft || isFuture)) {
      continue;
    }

    posts.push({
      slug,
      filename,
      filePath,
      title,
      description,
      dateISO,
      updatedISO,
      tags,
      draft,
      isFuture,
      image,
      readingTimeMinutes,
      body,
    });
  }

  posts.sort((a, b) => {
    if (a.dateISO !== b.dateISO) return b.dateISO.localeCompare(a.dateISO);
    return b.filename.localeCompare(a.filename);
  });

  return { posts, errors, warnings, todayIST };
}
