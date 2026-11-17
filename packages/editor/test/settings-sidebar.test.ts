// @vitest-environment happy-dom
import { h, render } from 'preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isSideView, showsPage } from '../src/shell.js'
import { Shell } from '../src/ui/shell/shell.js'
import { createEditor, type Editor, EditorContext } from '../src/ui/state/editor.js'
import type { Catalog } from '../src/ui/types.js'

const catalog: Catalog = {
  sectionOptions: { hero: [] },
  siteOptions: [],
  contentCounts: {},
  sectionDefaults: { hero: {} },
  sectionLabels: { hero: 'Hero' },
}

describe('settings sidebars', () => {
  let editor: Editor | undefined
  let root: HTMLElement

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 503 })),
    )
    root = document.createElement('div')
    document.body.append(root)
    editor = createEditor()
    editor.doc.catalog.value = catalog
    editor.doc.markSaved(
      { slug: 'index', title: 'Home', seo: {}, sections: [{ id: 'hero', type: 'hero', anchor: 'hero', props: {} }] },
      { name: 'Site', header: { links: [] } },
    )
  })

  afterEach(() => {
    render(null, root)
    root.remove()
    editor?.dispose()
    editor = undefined
    vi.unstubAllGlobals()
  })

  const draw = () => {
    render(h(EditorContext.Provider, { value: editor as Editor }, h(Shell, { catalog })), root)
  }

  it('keeps the page on the canvas for Site, Navigation, Footer and Design, and covers it for the rest', () => {
    expect(['navigation', 'footer', 'site', 'design'].every(isSideView)).toBe(true)
    expect(['seo', 'media', 'listing:pages'].some(showsPage)).toBe(false)
    expect(showsPage('canvas')).toBe(true)
  })

  it('opens Navigation in the right-hand sidebar, with the resize edge, in place of the inspector', async () => {
    const { ui } = editor as Editor
    ui.openView('navigation')
    draw()
    await Promise.resolve()
    const side = root.querySelector('aside.bm-settings-side')
    expect(side?.getAttribute('aria-label')).toBe('Navigation')
    expect(side?.querySelector('[role="separator"]')?.getAttribute('aria-label')).toBe('Resize Navigation settings')
    expect(root.querySelector('aside[aria-label="Inspector"]')).toBeNull()
    expect(root.querySelector('main.bm-view')).toBeNull()
    const close = side?.querySelector<HTMLButtonElement>('.bm-side-close')
    expect(close).toBeTruthy()
    close?.click()
    expect(ui.view.value).toBe('canvas')
  })

  it('keeps SEO as a full-screen view', async () => {
    ;(editor as Editor).ui.openView('seo')
    draw()
    await Promise.resolve()
    expect(root.querySelector('main.bm-view')?.getAttribute('aria-label')).toBe('SEO')
    expect(root.querySelector('aside.bm-settings-side')).toBeNull()
  })
})
