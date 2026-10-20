import { describe, expect, it } from 'vitest'
import { PreviewUnavailableError, defineThemePreview, loadThemePreview } from '../src/preview.js'
import type { contentModel } from './starter.js'

const environment = (module: unknown) => ({ runner: { import: async () => module } })

describe('defineThemePreview', () => {
  it('returns the preview and types its inputs from the model', () => {
    const preview = defineThemePreview<typeof contentModel>({
      async page({ sections, motion }) {
        // `type` is the starter's section union, not a string.
        const first:
          | 'hero'
          | 'logoStrip'
          | 'features'
          | 'textImage'
          | 'stats'
          | 'testimonials'
          | 'pricing'
          | 'video'
          | 'faq'
          | 'cta'
          | 'contact'
          | undefined = sections[0]?.type
        return `${first ?? 'none'}:${motion}`
      },
      async site({ site, pathname }) {
        const variant: 'bar' | 'centered' | 'floating' = site.header.variant
        return { header: `${variant}${pathname}`, footer: '' }
      },
    })
    return expect(preview.page({ sections: [], motion: true })).resolves.toBe('none:true')
  })

  it('refuses a preview without a page renderer or with a bad site renderer', () => {
    expect(() => defineThemePreview({} as never)).toThrow(/page/)
    expect(() => defineThemePreview({ page: async () => '', site: 1 as never })).toThrow(/site/)
  })
})

describe('loadThemePreview', () => {
  it('loads the default export', async () => {
    const preview = defineThemePreview({ page: async () => '<p>x</p>' })
    expect(await loadThemePreview(environment({ default: preview }), '/src/lib/render-preview.ts')).toBe(preview)
  })

  it('names the module when it does not default-export a preview', async () => {
    await expect(loadThemePreview(environment({ renderPagePreview: () => '' }), '/src/p.ts')).rejects.toThrow(
      /\/src\/p\.ts must default-export defineThemePreview/,
    )
    await expect(loadThemePreview(environment({ default: { site: () => ({}) } }), '/src/p.ts')).rejects.toThrow(/default-export/)
  })

  it('reports an environment without a module runner as unavailable', async () => {
    await expect(loadThemePreview({}, '/src/p.ts')).rejects.toBeInstanceOf(PreviewUnavailableError)
  })
})
