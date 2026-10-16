import { batch } from '@preact/signals'
import {
  addSection,
  anchorSet,
  duplicateSection,
  moveSection,
  nextSectionId,
  removeSection,
  reorderList,
  sectionFromDefaults,
  suggestAnchor,
} from '../../draft.js'
import type { Option } from '../types.js'
import type { DocumentStore } from './document.js'
import type { Edits } from './edits.js'
import type { InsertWhere, UiState } from './ui.js'

function defaultChoice(options: readonly Option[] | undefined, name: string): string {
  const option = options?.find((item) => item.name === name)
  return option && typeof option.default === 'string' ? option.default : ''
}

/** Adding, moving, copying and removing sections, from the page bars and the sidebar alike. */
export function createSectionActions(doc: DocumentStore, ui: UiState, edits: Edits) {
  function insert(type: string, where: InsertWhere, id: string) {
    const page = doc.page.peek()
    const catalog = doc.catalog.peek()
    if (!page || !catalog) return
    const index = page.sections.findIndex((section) => section.id === id)
    const at = index < 0 ? page.sections.length : where === 'above' ? index : index + 1
    const options = catalog.sectionOptions[type]
    const section = sectionFromDefaults(
      type,
      nextSectionId(page.sections, type),
      catalog.sectionDefaults[type] ?? {},
      defaultChoice(options, 'variant'),
      defaultChoice(options, 'tone'),
    )
    section.anchor = suggestAnchor(section, anchorSet(page.sections))
    batch(() => {
      edits.updatePage(addSection(page, at, section), true)
      ui.selectedId.value = section.id
      ui.picker.value = null
      ui.status.value = `Added ${catalog.sectionLabels[type] ?? type}. The preview updates without saving.`
      ui.open.value = true
      ui.tab.value = 'section'
    })
  }

  function move(id: string, direction: -1 | 1) {
    const page = doc.page.peek()
    if (page) edits.updatePage(moveSection(page, id, direction), true)
  }

  function reorder(from: number, to: number) {
    const page = doc.page.peek()
    if (page) edits.updatePage({ ...page, sections: reorderList(page.sections, from, to) }, true)
  }

  function askDuplicate(id: string) {
    ui.confirm.value = { id, action: 'duplicate' }
  }

  function askDelete(id: string) {
    ui.confirm.value = { id, action: 'delete' }
  }

  /** Carry out the duplicate or delete the confirm dialog asked about. */
  function confirm() {
    const current = ui.confirm.peek()
    const page = doc.page.peek()
    if (!current || !page) return
    batch(() => {
      if (current.action === 'delete') {
        edits.updatePage(removeSection(page, current.id), true)
        ui.status.value = 'Section removed from the draft. The preview updates without saving.'
      } else {
        edits.updatePage(duplicateSection(page, current.id), true)
        ui.status.value = 'Section duplicated in the draft. The preview updates without saving.'
      }
      ui.confirm.value = null
    })
  }

  function openSettings(id: string) {
    batch(() => {
      ui.selectedId.value = id
      ui.tab.value = 'section'
      ui.open.value = true
      ui.focusField.value = `section:${id}`
      ui.addMenu.value = null
      ui.picker.value = null
    })
  }

  function openFooterSettings() {
    batch(() => {
      ui.tab.value = 'footer'
      ui.open.value = true
      ui.addMenu.value = null
      ui.picker.value = null
    })
  }

  return { insert, move, reorder, askDuplicate, askDelete, confirm, openSettings, openFooterSettings }
}

export type SectionActions = ReturnType<typeof createSectionActions>
