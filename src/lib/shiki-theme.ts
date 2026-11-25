import type { ThemeRegistration } from 'shiki';

export const latticeTheme: ThemeRegistration = {
  name: 'tenant-lattice',
  type: 'dark',
  colors: {
    'editor.background': '#071E20',
    'editor.foreground': '#F4E9D3',
  },
  tokenColors: [
    {
      scope: ['comment', 'punctuation.definition.comment'],
      settings: { foreground: '#7FB8BC', fontStyle: 'italic' },
    },
    {
      scope: ['keyword', 'storage.type', 'storage.modifier', 'keyword.control'],
      settings: { foreground: '#FFB547' },
    },
    {
      scope: ['string', 'constant.other.symbol', 'markup.inserted'],
      settings: { foreground: '#D9CEB8' },
    },
    {
      scope: ['constant.numeric', 'constant.language', 'variable.language'],
      settings: { foreground: '#E76F51' },
    },
    {
      scope: ['entity.name.function', 'support.function', 'meta.function-call'],
      settings: { foreground: '#FFB547' },
    },
    {
      scope: ['entity.name.type', 'entity.name.class', 'support.type', 'support.class'],
      settings: { foreground: '#7FB8BC' },
    },
    {
      scope: ['variable', 'entity.name.tag', 'support.variable'],
      settings: { foreground: '#F4E9D3' },
    },
    {
      scope: ['punctuation', 'meta.brace'],
      settings: { foreground: '#7FB8BC' },
    },
  ],
};
