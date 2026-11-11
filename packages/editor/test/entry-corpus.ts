/** Synthetic golden corpus for Markdown entries. Strings, not files, so line endings and BOMs cannot be normalised by git. */
export const CORPUS: Record<string, { source: string; mdx?: boolean }> = {
  plain: {
    source:
      '---\ntitle: "Hello"\ndate: 2026-01-05\ntags: [a, b]\n---\n\nFirst paragraph.\n\nSecond paragraph with *emph* and __strong__.\n',
  },
  comments: {
    source:
      '---\n# keep this comment\ntitle: Hello   # trailing\ndraft:   false\ndate: "2026-01-05"\nz: 1\na: 2\ndesc: >-\n  folded\n  text\n---\nBody\n',
  },
  crlf: { source: '---\r\ntitle: Win\r\n---\r\n\r\nLine one\r\n\r\nLine two\r\n' },
  noTrailingNewline: { source: '---\ntitle: x\n---\nno trailing newline' },
  structures: {
    source:
      '---\ntitle: t\n---\n\n| a | b |\n|---|:-:|\n| 1 | 2 |\n\n```js\nconst x = 1;\n```\n\n* item\n* item2\n    * nested four-space\n\n1) one\n2) two\n\n> quote\n> more\n\nSetext\n======\n\n***\n\n![img](./a.png "t")\n\n[ref]: http://x.com\n',
  },
  html: {
    source: '---\ntitle: h\n---\n\n<div class="x">\n  raw *html*\n</div>\n\nText with <kbd>k</kbd> inline.\n\n<!-- comment -->\n',
  },
  mdx: {
    mdx: true,
    source: '---\ntitle: m\n---\n\nimport Foo from "../Foo.astro"\n\n<Foo bar={1} />\n\nPlain text.\n',
  },
  footnoteAndDirective: {
    source: '---\ntitle: f\n---\n\nText[^1].\n\n[^1]: Note here.\n\n:::note\ndirective\n:::\n\nAfter.\n',
  },
  noFrontmatter: { source: 'Just a body, no frontmatter.\n' },
  emptyFrontmatter: { source: '---\n---\n\nBody\n' },
  ruleInBody: { source: '---\ntitle: x\n---\n\nabove\n\n---\n\nbelow\n' },
  bom: { source: '﻿---\ntitle: bom\n---\n\nBody\n' },
  unclosedFence: { source: '---\ntitle: x\n\nNot frontmatter, never closed.\n' },
  extraBlankLines: { source: '---\ntitle: x\n---\n\n\n\nA\n\n\n\n\nB\n\n\n' },
}
