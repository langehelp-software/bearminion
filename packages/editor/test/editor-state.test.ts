// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAt, type PageDraft } from '../src/draft.js'
import { createEditor, type Editor } from '../src/ui/state/editor.js'
import type { Catalog, SiteDraft } from '../src/ui/types.js'

const HEADING = 'sections.0.props.heading'

function page(): PageDraft {
  return { slug: 'index', title: 'Home', seo: {}, sections: [{ id: 'hero', type: 'hero', anchor: 'hero', props: { heading: 'Hello' } }] }
}

function site(): SiteDraft {
  return { name: 'Site', header: { links: [] } }
}

const catalog: Catalog = {
  sectionOptions: { hero: [] },
  siteOptions: [],
  contentCounts: {},
  sectionDefaults: { hero: { heading: 'New section' } },
  sectionLabels: { hero: 'Hero' },
}

/** An editor with both drafts loaded and clean, as `load` leaves it. */
function loaded(): Editor {
  const editor = createEditor()
  editor.doc.catalog.value = catalog
  editor.doc.markSaved(page(), site())
  return editor
}

describe('editor state', () => {
  let editor: Editor | undefined

  beforeEach(() => {
    // Live previews post to the dev server; here they fail quietly.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 503 })),
    )
  })

  afterEach(() => {
    editor?.dispose()
    editor = undefined
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('tracks dirty per document against what is on disk', () => {
    editor = loaded()
    const { doc, edits } = editor
    expect(doc.dirty.value).toBe(false)
    edits.writeField(HEADING, 'Changed')
    expect([doc.pageDirty.value, doc.siteDirty.value, doc.dirty.value]).toEqual([true, false, true])
    doc.markSaved(doc.page.value, null)
    expect(doc.dirty.value).toBe(false)
  })

  it('queues edits made before the drafts load', () => {
    editor = createEditor()
    editor.edits.writeField('name', 'Early')
    expect(editor.doc.site.value).toBeNull()
    expect(editor.edits.takePending()).toEqual([{ path: 'name', value: 'Early' }])
    expect(editor.edits.takePending()).toEqual([])
  })

  it('inserts a section after the given one, selects it, and deletes it after confirming', () => {
    editor = loaded()
    const { doc, ui, sections } = editor
    sections.insert('hero', 'below', 'hero')
    const added = doc.page.value?.sections[1]
    expect(added?.id).not.toBe('hero')
    expect(added?.anchor).not.toBe('hero')
    expect(getAt(added, 'props.heading')).toBe('New section')
    expect([ui.selectedId.value, ui.tab.value, ui.open.value]).toEqual([added?.id, 'section', true])

    sections.askDelete(added?.id ?? '')
    sections.confirm()
    expect(doc.page.value?.sections.map((section) => section.id)).toEqual(['hero'])
    expect(ui.confirm.value).toBeNull()
  })

  it('collapses a burst of edits into one undo step', () => {
    vi.useFakeTimers()
    editor = loaded()
    const { doc, undo, edits, ui } = editor
    undo.noteChange()
    for (const heading of ['O', 'On', 'One']) {
      edits.writeField(HEADING, heading)
      undo.noteChange()
    }
    vi.advanceTimersByTime(450)
    expect(undo.undoable.value).toBe(true)

    editor.stepUndo()
    expect(getAt(doc.page.value, HEADING)).toBe('Hello')
    expect(ui.status.value).toBe('Undone.')
    expect(undo.undoable.value).toBe(false)

    editor.stepRedo()
    expect(getAt(doc.page.value, HEADING)).toBe('One')
    expect(ui.status.value).toBe('Redone.')
  })

  it('backs out one layer per Escape: the dialog, then the confirm, then nothing', () => {
    editor = loaded()
    const { ui } = editor
    ui.dialog.value = { kind: 'changes' }
    ui.confirm.value = { id: 'hero', action: 'delete' }
    expect(ui.dismissDialog()).toBe(true)
    expect(ui.dialog.value).toBeNull()
    expect(ui.dismissDialog()).toBe(true)
    expect(ui.confirm.value).toBeNull()
    expect(ui.dismissDialog()).toBe(false)
    expect(ui.closePopovers()).toBe(false)
  })

  it('applies a link edit to the button record and closes the popover', () => {
    editor = loaded()
    const { doc, ui, edits, links } = editor
    edits.writeField('sections.0.props.cta', { label: 'Go', href: '/start' })
    links.open('sections.0.props.cta', { label: 'Go', href: '/start' }, new DOMRect(10, 20, 100, 30))
    expect(ui.linkEdit.value).toMatchObject({ top: 58, left: 10, newTab: false, button: true })

    links.update({ label: 'Start now', href: 'https://example.com' })
    links.apply()
    expect(getAt(doc.page.value, 'sections.0.props.cta')).toMatchObject({ label: 'Start now', href: 'https://example.com' })
    expect(ui.linkEdit.value).toBeNull()
    expect(ui.status.value).toBe('Link updated in the draft.')
  })
})
