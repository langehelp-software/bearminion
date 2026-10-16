import { batch } from '@preact/signals'
import { getAt, isButtonLinkPath } from '../../draft.js'
import { updateRichLink } from '../../rich-text.js'
import type { LinkEdit, LinkRecord } from '../types.js'
import { type DocumentStore, isPagePath } from './document.js'
import type { Edits } from './edits.js'
import type { LivePreview } from './live-preview.js'
import type { UiState } from './ui.js'

/** Where the link popover opens: under the clicked element, kept off the left edge. */
function anchorBelow(rect: DOMRect): Pick<LinkEdit, 'top' | 'left'> {
  return { top: rect.bottom + 8, left: Math.max(8, rect.left) }
}

/** The link popover: open it on a button, a nav link or a link inside rich text, then apply or remove. */
export function createLinkEditor(doc: DocumentStore, ui: UiState, edits: Edits, preview: LivePreview) {
  function show(edit: LinkEdit) {
    batch(() => {
      ui.linkEdit.value = edit
      ui.rich.value = null
    })
  }

  /** A link record (button, nav link) at `path`. */
  function open(path: string, record: LinkRecord, rect: DOMRect) {
    const external = /^https?:\/\//i.test(record.href)
    show({
      ...anchorBelow(rect),
      path,
      label: record.label,
      href: record.href,
      newTab: record.newTab === true || (record.newTab !== false && external),
      id: typeof record.id === 'string' ? record.id : '',
      style: typeof record.style === 'string' ? record.style : '',
      button: isButtonLinkPath(path),
      // Optional buttons and links can be deleted outright; required ones cannot.
      removable: doc.isOptional(path),
      advanced: false,
    })
  }

  /** The `index`-th link inside the rich text at `path`. */
  function openRich(path: string, index: number, link: { label: string; href: string; newTab: boolean }, rect: DOMRect) {
    show({
      ...anchorBelow(rect),
      path,
      label: link.label,
      href: link.href,
      newTab: link.newTab,
      id: '',
      style: '',
      button: false,
      removable: false,
      richIndex: index,
      advanced: false,
    })
  }

  function update(patch: Partial<LinkEdit>) {
    const current = ui.linkEdit.peek()
    if (current) ui.linkEdit.value = { ...current, ...patch }
  }

  function close() {
    ui.linkEdit.value = null
  }

  function apply() {
    const edit = ui.linkEdit.peek()
    if (!edit) return
    batch(() => {
      if (edit.richIndex !== undefined) {
        const current = getAt(doc.docFor(edit.path), edit.path)
        if (typeof current === 'string') {
          edits.writeField(edit.path, updateRichLink(current, edit.richIndex, { label: edit.label, href: edit.href, newTab: edit.newTab }))
        }
      } else {
        edits.writeField(`${edit.path}.label`, edit.label)
        edits.writeField(`${edit.path}.href`, edit.href)
        edits.writeField(`${edit.path}.newTab`, edit.newTab)
        if (edit.button) edits.writeOrClear(`${edit.path}.id`, edit.id.trim())
        if (edit.button && isPagePath(edit.path)) edits.writeOrClear(`${edit.path}.style`, edit.style)
      }
      if (isPagePath(edit.path)) preview.schedulePage()
      ui.linkEdit.value = null
      ui.status.value = 'Link updated in the draft.'
    })
  }

  function remove() {
    const edit = ui.linkEdit.peek()
    if (!edit?.removable) return
    batch(() => {
      edits.writeField(edit.path, undefined)
      ui.linkEdit.value = null
      ui.status.value = 'Button removed from the draft.'
    })
  }

  return { open, openRich, update, close, apply, remove }
}

export type LinkEditor = ReturnType<typeof createLinkEditor>
