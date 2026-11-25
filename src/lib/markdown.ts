import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';
import { visit } from 'unist-util-visit';
import { toString as hastToString } from 'hast-util-to-string';
import { createHighlighter, type Highlighter } from 'shiki';
import type { Root, Element, Text } from 'hast';
import { latticeTheme } from './shiki-theme';

export interface TocHeading {
  readonly depth: 2 | 3;
  readonly id: string;
  readonly text: string;
}

export interface RenderedMarkdown {
  readonly html: string;
  readonly headings: readonly TocHeading[];
  readonly hasMermaid: boolean;
  readonly hasMath: boolean;
}

let highlighterPromise: Promise<Highlighter> | null = null;

async function getHighlighterInstance(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [latticeTheme],
      langs: [
        'bash',
        'sh',
        'python',
        'typescript',
        'javascript',
        'json',
        'yaml',
        'markdown',
        'kotlin',
        'cpp',
        'sql',
        'diff',
        'plaintext',
      ],
    });
  }
  return highlighterPromise;
}

function getTextFromElement(el: Element): string {
  return hastToString(el).trim();
}

export async function renderPostMarkdown(markdown: string): Promise<RenderedMarkdown> {
  const headings: TocHeading[] = [];
  let hasMermaid = false;
  const hasMath = /\$\$[\s\S]+?\$\$|\$[^\s$][^$]*\$/.test(markdown);
  const highlighter = await getHighlighterInstance();
  const loadedLangs = new Set(highlighter.getLoadedLanguages());

  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype, { allowDangerousHtml: false })
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, {
      behavior: 'append',
      properties: {
        className: ['heading-anchor'],
        ariaLabel: 'Link to this section',
      },
      content: {
        type: 'text',
        value: '#',
      },
    })
    .use(rehypeKatex)
    .use(() => (tree: Root) => {
      // Extract TOC headings (h2, h3) before adding anchor text
      visit(tree, 'element', (node: Element) => {
        if (node.tagName === 'h2' || node.tagName === 'h3') {
          const id = typeof node.properties?.id === 'string' ? node.properties.id : '';
          if (!id) return;
          const cleanChildren = node.children.filter(
            (c) =>
              !(
                c.type === 'element' &&
                Array.isArray(c.properties?.className) &&
                c.properties.className.includes('heading-anchor')
              )
          );
          const text = cleanChildren
            .map((c) => (c.type === 'text' ? c.value : c.type === 'element' ? hastToString(c) : ''))
            .join('')
            .trim();
          if (text) {
            headings.push({
              depth: node.tagName === 'h2' ? 2 : 3,
              id,
              text,
            });
          }
        }
      });

      // Callouts: > [!NOTE], > [!WARNING], > [!LEAK]
      visit(tree, 'element', (node: Element) => {
        if (node.tagName !== 'blockquote') return;
        const firstPara = node.children.find(
          (c): c is Element => c.type === 'element' && c.tagName === 'p'
        );
        if (!firstPara || firstPara.children.length === 0) return;
        const firstText = firstPara.children[0];
        if (!firstText || firstText.type !== 'text') return;

        const match = /^\[!(NOTE|WARNING|LEAK)\]\s*/i.exec(firstText.value);
        if (!match) return;

        const kind = match[1]!.toLowerCase();
        firstText.value = firstText.value.slice(match[0].length);
        if (!firstText.value.trim()) {
          firstPara.children.shift();
        }

        node.tagName = 'div';
        node.properties = {
          className: ['callout', `callout--${kind}`],
          role: 'note',
        };
        const titleEl: Element = {
          type: 'element',
          tagName: 'div',
          properties: { className: ['callout-title'] },
          children: [{ type: 'text', value: kind.toUpperCase() } as Text],
        };
        node.children.unshift(titleEl);
      });

      // External links: rel="noopener noreferrer" target="_blank"
      visit(tree, 'element', (node: Element) => {
        if (node.tagName === 'a') {
          const href = typeof node.properties?.href === 'string' ? node.properties.href : '';
          if (/^https?:\/\//i.test(href)) {
            node.properties = {
              ...node.properties,
              target: '_blank',
              rel: ['noopener', 'noreferrer'],
            };
          }
        }
      });

      // Local images in content/blog/assets/
      visit(tree, 'element', (node: Element) => {
        if (node.tagName === 'img') {
          const src = typeof node.properties?.src === 'string' ? node.properties.src : '';
          const normalizedSrc = src.startsWith('./assets/')
            ? `/blog-assets/${src.slice('./assets/'.length)}`
            : src.startsWith('assets/')
              ? `/blog-assets/${src.slice('assets/'.length)}`
              : src;
          node.properties = {
            ...node.properties,
            src: normalizedSrc,
            loading: 'lazy',
            decoding: 'async',
          };
        }
      });

      // Tables: wrap in .table-wrap for isolated horizontal scroll
      visit(tree, 'element', (node: Element, index, parent) => {
        if (node.tagName === 'table' && parent && typeof index === 'number') {
          if (
            parent.type === 'element' &&
            Array.isArray(parent.properties?.className) &&
            parent.properties.className.includes('table-wrap')
          ) {
            return;
          }
          parent.children[index] = {
            type: 'element',
            tagName: 'div',
            properties: { className: ['table-wrap'] },
            children: [node],
          };
        }
      });

      // Code blocks: Mermaid + Shiki highlighting + Copy button
      visit(tree, 'element', (node: Element, index, parent) => {
        if (node.tagName !== 'pre' || !parent || typeof index !== 'number') return;
        const codeEl = node.children.find(
          (c): c is Element => c.type === 'element' && c.tagName === 'code'
        );
        if (!codeEl) return;

        const classes = Array.isArray(codeEl.properties?.className)
          ? codeEl.properties.className.map(String)
          : [];
        const langClass = classes.find((c) => c.startsWith('language-'));
        const lang = langClass ? langClass.slice('language-'.length).toLowerCase() : 'plaintext';
        const rawCode = getTextFromElement(codeEl);

        if (lang === 'mermaid') {
          hasMermaid = true;
          parent.children[index] = {
            type: 'element',
            tagName: 'div',
            properties: {
              className: ['mermaid-block'],
              'data-mermaid': rawCode,
            },
            children: [
              {
                type: 'element',
                tagName: 'pre',
                properties: {},
                children: [{ type: 'text', value: rawCode }],
              },
            ],
          };
          return;
        }

        const safeLang = loadedLangs.has(lang) ? lang : 'plaintext';
        const shikiTree = highlighter.codeToHast(rawCode, {
          lang: safeLang,
          theme: 'tenant-lattice',
        });

        const preNode = shikiTree.children.find(
          (c): c is Element => c.type === 'element' && c.tagName === 'pre'
        );
        if (!preNode) return;

        parent.children[index] = {
          type: 'element',
          tagName: 'div',
          properties: { className: ['code-block-wrap'] },
          children: [
            {
              type: 'element',
              tagName: 'div',
              properties: { className: ['code-block-bar'] },
              children: [
                {
                  type: 'element',
                  tagName: 'span',
                  properties: {},
                  children: [{ type: 'text', value: lang }],
                },
                {
                  type: 'element',
                  tagName: 'button',
                  properties: {
                    type: 'button',
                    className: ['copy-code-btn'],
                    'data-copy-code': rawCode,
                  },
                  children: [{ type: 'text', value: 'Copy' }],
                },
              ],
            },
            preNode,
          ],
        };
      });
    })
    .use(rehypeStringify);

  const file = await processor.process(markdown);

  return {
    html: String(file),
    headings,
    hasMermaid,
    hasMath,
  };
}
