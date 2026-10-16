import type { ContentModel } from './model.js'
import type { SectionOf } from './section-schema.js'
import type { SiteOf } from './site.js'

/** The header and footer of a draft site, as HTML. */
export interface SitePreviewHtml {
  header: string
  footer: string
}

/**
 * How a theme renders drafts for the editor's live preview. The editor calls it from the dev server;
 * it never reads or writes content files.
 */
export interface ThemePreview<TModel extends ContentModel = ContentModel> {
  /** The draft page's sections as HTML, which replaces `main#content`. Orphaned sections are already left out. */
  page(input: { sections: SectionOf<TModel['sections']>[]; motion: boolean }): Promise<string>
  /**
   * The draft site's header and footer as HTML, so brand, layout and links update without a reload.
   * Optional: without it, header and footer changes appear after you save and reload.
   */
  site?(input: { site: SiteOf<TModel['site']>; pathname: string }): Promise<SitePreviewHtml>
}

/**
 * Declare a theme's preview renderer. Default-export it from the module named by `previewModule`
 * (default `/src/lib/render-preview.ts`). The model type ties the inputs to your section registry and site:
 *
 * ```ts
 * export default defineThemePreview<typeof contentModel>({
 *   async page({ sections, motion }) { ... },
 *   async site({ site, pathname }) { ... },
 * })
 * ```
 */
export function defineThemePreview<TModel extends ContentModel = ContentModel>(preview: ThemePreview<TModel>): ThemePreview<TModel> {
  if (typeof preview?.page !== 'function') throw new TypeError('defineThemePreview needs a `page` function.')
  if (preview.site !== undefined && typeof preview.site !== 'function') {
    throw new TypeError('defineThemePreview: `site` must be a function when given.')
  }
  return preview
}

/** The theme has no renderer for this preview. The API answers 501 instead of 500. */
export class PreviewUnavailableError extends Error {}

interface ModuleRunner {
  import?: (id: string) => Promise<unknown>
}

/** Load the preview module through the Vite SSR runner and check it default-exports a preview. */
export async function loadThemePreview(environment: object, previewModule: string): Promise<ThemePreview> {
  const runner = (environment as { runner?: ModuleRunner }).runner
  if (!runner?.import) throw new PreviewUnavailableError('The SSR dev environment cannot render a preview.')
  const loaded = (await runner.import(previewModule)) as { default?: Partial<ThemePreview> } | undefined
  const preview = loaded?.default
  if (!preview || typeof preview.page !== 'function') {
    throw new Error(`${previewModule} must default-export defineThemePreview({ page, site? }).`)
  }
  return preview as ThemePreview
}
