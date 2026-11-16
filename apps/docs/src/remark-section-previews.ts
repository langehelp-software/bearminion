import { existsSync } from 'node:fs'
import path from 'node:path'

export interface SectionPreviewsOptions {
  /** Absolute path of `docs/sections`. */
  sectionsDir: string
  /** Absolute path of the built previews (`public/previews`), from scripts/build-previews.mjs. */
  previewsDir: string
  /** Collects screenshots whose preview is missing, for `checkLinks()` to fail the build. */
  problems: string[]
}

interface MarkdownNode {
  type: string
  url?: string
  alt?: string
  value?: string
  children?: MarkdownNode[]
}

interface MarkdownFile {
  path?: string
}

const SCREENSHOT = /^\.\.\/images\/sections\/([a-z0-9-]+)\.webp$/

const escapeAttribute = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

/** The markup of one live preview. `public/section-preview.js` makes the controls work; without it the frame still shows. */
export function previewHtml(section: string, variant: string, title: string): string {
  const src = `/previews/section/${section}/${variant}/`
  const button = (attribute: string, value: string, label: string, pressed = false) =>
    `<button type="button" ${attribute}="${value}" aria-pressed="${pressed}">${label}</button>`
  return [
    `<bm-section-preview class="not-content bm-preview" data-section="${section}" data-variant="${variant}">`,
    '<div class="bm-preview-bar">',
    '<div class="bm-preview-tabs" role="tablist" aria-label="Show">',
    '<button type="button" role="tab" data-tab="preview" aria-selected="true">Preview</button>',
    '<button type="button" role="tab" data-tab="content" aria-selected="false">Content</button>',
    '</div>',
    '<div class="bm-preview-controls">',
    `<div class="bm-preview-group" role="group" aria-label="Tone">${['base', 'subtle', 'inverse', 'brand'].map((tone) => button('data-tone-choice', tone, tone, tone === 'base')).join('')}</div>`,
    `<div class="bm-preview-group" role="group" aria-label="Width">${[
      ['1280', 'Desktop'],
      ['768', 'Tablet'],
      ['390', 'Phone'],
    ]
      .map(([width, label]) => button('data-width', width as string, label as string, width === '1280'))
      .join('')}</div>`,
    `<a class="bm-preview-open" href="${src}" target="_blank" rel="noopener">Open</a>`,
    '</div>',
    '</div>',
    `<div class="bm-preview-stage"><iframe src="${src}" title="${escapeAttribute(title)}" loading="lazy"></iframe></div>`,
    '<div class="bm-preview-content" hidden><button type="button" class="bm-preview-copy">Copy</button><pre><code></code></pre></div>',
    '</bm-section-preview>',
  ].join('')
}

/**
 * The section pages show a screenshot of each layout (`../images/sections/hero-split.webp`), which GitHub displays. On
 * the docs site each one becomes the layout itself, live in a frame, with its tones, widths and content. The frames
 * load pages that scripts/build-previews.mjs builds from the template; without that build the screenshots stay.
 */
export function remarkSectionPreviews(options: SectionPreviewsOptions) {
  const built = existsSync(path.join(options.previewsDir, 'section'))
  // The tree is mdast; typed loosely here, as the nodes this plugin reads and writes are all it needs.
  return (tree: unknown, file: MarkdownFile): void => {
    if (!built || !file.path) return
    const relative = path.relative(options.sectionsDir, file.path)
    if (relative.startsWith('..') || path.dirname(relative) !== '.' || relative === 'README.md') return
    const section = path.basename(relative, '.md')
    const replace = (parent: MarkdownNode) => {
      for (const [index, node] of (parent.children ?? []).entries()) {
        const image = node.type === 'paragraph' && node.children?.length === 1 ? node.children[0] : undefined
        const name = image?.type === 'image' ? SCREENSHOT.exec(image.url ?? '')?.[1] : undefined
        if (image && name?.startsWith(`${section}-`)) {
          const variant = name.slice(section.length + 1)
          if (!existsSync(path.join(options.previewsDir, 'section', section, variant, 'index.html'))) {
            options.problems.push(`docs/sections/${relative}: no preview for ${section}/${variant}; is it still a layout?`)
            continue
          }
          ;(parent.children as MarkdownNode[])[index] = { type: 'html', value: previewHtml(section, variant, image.alt ?? '') }
        } else replace(node)
      }
    }
    replace(tree as MarkdownNode)
  }
}
