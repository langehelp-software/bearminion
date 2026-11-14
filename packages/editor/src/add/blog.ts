/*
 * Declaring a blog in a site's content model, by editing `src/lib/content-model.ts` as text. It changes the file only
 * when it finds the three things the starter's file has: the import from `bearminion`, the `site: siteDefinition,`
 * line, and no `types` yet. Anything else is the person's own shape, and they get the lines to paste instead.
 *
 * `create-bearminion` carries a copy of this file (a test holds the two equal): it cannot import from this package.
 */

export const CONTENT_MODEL_PATH = 'src/lib/content-model.ts'

/** The blog type, as the lines that go into the content model. */
export const BLOG_TYPE = [
  '  types: defineTypes({',
  '    blog: multi({',
  "      path: '/blog/{slug}',",
  '      fields: z.object({',
  '        date: z.iso.date(),',
  '        excerpt: z.string().max(200).optional(),',
  '        cover: imageSchema.optional(),',
  '        draft: z.boolean().default(false),',
  '      }),',
  "      sort: { by: 'date', order: 'desc' },",
  '      listing: { perPage: 10 },',
  '    }),',
  '  }),',
]

const NEEDED = ['defineTypes', 'imageSchema', 'multi']
const BEARMINION_IMPORT = /^import \{([^}]*)\} from 'bearminion'\s*;?$/m
const ZOD_IMPORT = /^import \{[^}]*\bz\b[^}]*\} from 'zod'\s*;?$/m
const SITE_LINE = /^([ \t]*)site: siteDefinition,[ \t]*$/m

export type BlogModel =
  /** The content model with the blog type added. */
  | { action: 'declare'; source: string }
  /** The model already declares types. Nothing to do here: a blog may be among them, or the person adds it. */
  | { action: 'present' }
  /** The file is not shaped like the starter's, so it is left alone. */
  | { action: 'manual' }

/** The content model `source` with a blog type declared, or why it was left as it is. */
export function declareBlog(source: string): BlogModel {
  if (/^\s*types\s*:/m.test(source)) return { action: 'present' }
  const imported = BEARMINION_IMPORT.exec(source)
  const site = SITE_LINE.exec(source)
  if (!imported || !site) return { action: 'manual' }
  const names = (imported[1] ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '')
  const merged = [...new Set([...names, ...NEEDED])].sort((a, b) => a.localeCompare(b))
  let next = source.replace(BEARMINION_IMPORT, `import { ${merged.join(', ')} } from 'bearminion'`)
  if (!ZOD_IMPORT.test(next)) {
    // After the last import, so the file's own order of imports is kept.
    const imports = [...next.matchAll(/^import [^\n]*\n/gm)]
    const last = imports[imports.length - 1]
    const at = last ? (last.index ?? 0) + last[0].length : 0
    next = `${next.slice(0, at)}import { z } from 'zod'\n${next.slice(at)}`
  }
  const indent = site[1] ?? '  '
  const block = BLOG_TYPE.map((line) => indent + line.slice(2)).join('\n')
  next = next.replace(SITE_LINE, (line) => `${line}\n${block}`)
  return { action: 'declare', source: next }
}

/** What to tell the person once the files are in place. */
export function blogSteps(action: BlogModel['action']): string[] {
  const declared =
    action === 'declare'
      ? [`Declared the blog in ${CONTENT_MODEL_PATH}: posts at /blog/<slug>, newest first, listed at /blog, ten to a page.`]
      : action === 'present'
        ? [
            `${CONTENT_MODEL_PATH} already declares content types, so it was left as it is. Add the blog there if it is not one of them:`,
            '',
            ...BLOG_TYPE,
          ]
        : [
            `${CONTENT_MODEL_PATH} is not shaped like the starter's, so it was left as it is. Add these lines to your content model,`,
            "and import defineTypes, imageSchema and multi from 'bearminion' and z from 'zod':",
            '',
            ...BLOG_TYPE,
          ]
  return [
    ...declared,
    '',
    'Next: start the site, open the editor, and write the first post under Pages > Blog > New entry.',
    'Link to /blog from the header (Navigation tab) when there is something to read.',
    'More: https://docs.bearminion.com/content-types/',
  ]
}
