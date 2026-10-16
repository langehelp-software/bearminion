// @vitest-environment happy-dom
import { h, render } from 'preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEditor, EditorContext, type Editor } from '../src/ui/state/editor.js'
import { Sidebar } from '../src/ui/sidebar/sidebar.js'
import type { Catalog } from '../src/ui/types.js'

const catalog: Catalog = {
  sectionOptions: { hero: [] },
  siteOptions: [],
  contentCounts: {},
  sectionDefaults: { hero: { heading: 'New section' } },
  sectionLabels: { hero: 'Hero' },
}

describe('sidebar focus request', () => {
  let editor: Editor
  let container: HTMLElement

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 503 })),
    )
    editor = createEditor()
    editor.doc.catalog.value = catalog
    editor.doc.markSaved(
      { slug: 'index', title: 'Home', seo: {}, sections: [{ id: 'hero', type: 'hero', anchor: 'hero', props: { heading: 'Hello' } }] },
      { name: 'Site', header: { links: [] } },
    )
    container = document.createElement('div')
    document.body.append(container)
  })

  afterEach(() => {
    render(null, container)
    container.remove()
    editor.dispose()
    vi.unstubAllGlobals()
  })

  const mountSidebar = () => render(h(EditorContext.Provider, { value: editor }, h(Sidebar, { catalog })), container)
  /** Preact runs effects after paint (rAF, with a timer fallback), so wait for the request to be used up. */
  const used = () => vi.waitFor(() => expect(editor.ui.focusField.value).toBeNull())

  it('focuses the requested control and uses the request up', async () => {
    mountSidebar()
    editor.ui.selectedId.value = 'hero'
    editor.ui.tab.value = 'section'
    editor.ui.focusField.value = 'section:hero'
    await used()
    expect(document.activeElement?.getAttribute('data-editor-field')).toBe('section:hero')
  })

  it('drops a request whose control never renders', async () => {
    mountSidebar()
    editor.ui.tab.value = 'section'
    editor.ui.focusField.value = 'section:gone'
    await used()
    expect(document.activeElement?.hasAttribute('data-editor-field')).toBe(false)
  })
})
