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

/** A theme's preview, or a function that loads it on first use (so a server only pays for it when someone edits). */
export type ThemePreviewSource = ThemePreview | (() => ThemePreview | Promise<ThemePreview>)

export interface PreviewRenderers {
  renderPreview: (page: unknown, motion: boolean) => Promise<string>
  renderSitePreview: (site: unknown, pathname: string) => Promise<SitePreviewHtml>
}

/**
 * The two renderers the editor API calls, from a theme's preview. For a server that holds the theme's components in
 * its own bundle (the hosted editor); the dev server loads the module through Vite instead.
 */
export function previewRenderers(source: ThemePreviewSource): PreviewRenderers {
  let loading: Promise<ThemePreview> | undefined
  const load = (): Promise<ThemePreview> => {
    loading ??= Promise.resolve(typeof source === 'function' ? source() : source).then((preview) => {
      if (!preview || typeof preview.page !== 'function') {
        throw new Error('The preview module must default-export defineThemePreview({ page, site? }).')
      }
      return preview
    })
    // A failed load (a module that throws while it starts) is tried again on the next request.
    loading.catch(() => {
      loading = undefined
    })
    return loading
  }
  return {
    async renderPreview(page, motion) {
      const preview = await load()
      const sections = typeof page === 'object' && page !== null && 'sections' in page && Array.isArray(page.sections) ? page.sections : []
      return preview.page({ sections, motion })
    },
    async renderSitePreview(site, pathname) {
      const preview = await load()
      if (!preview.site)
        throw new PreviewUnavailableError('The theme preview does not define `site`, so header and footer have no live preview.')
      return preview.site({ site: site as never, pathname })
    },
  }
}
