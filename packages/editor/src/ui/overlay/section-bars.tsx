import { batch } from '@preact/signals'
import { FooterBar } from '../chrome/footer-bar.js'
import { SectionToolbar } from '../chrome/section-toolbar.js'
import { Icon } from '../icons.js'
import { useEditor } from '../state/editor.js'
import type { InsertWhere } from '../state/ui.js'

/** One bar per visible section (move, add, duplicate, settings, delete), the footer's bar, and the Add above/below menu. */
export function SectionBars() {
  const { doc, ui, layout, overlay, sections } = useEditor()
  const page = doc.page.value
  const labels = doc.catalog.value?.sectionLabels
  const footer = overlay.footerPlace.value
  const select = (id: string) => {
    ui.selectedId.value = id
  }
  return (
    <>
      {page &&
        overlay.toolbars.value.map(({ section, placement, active }) => (
          <SectionToolbar
            key={section.id}
            page={page}
            id={section.id}
            active={active}
            label={labels?.[section.type] ?? section.type ?? 'Section'}
            onMove={(direction) => {
              select(section.id)
              sections.move(section.id, direction)
            }}
            onAdd={() =>
              batch(() => {
                select(section.id)
                ui.addMenu.value = section.id
                ui.picker.value = null
              })
            }
            onDuplicate={() => {
              select(section.id)
              sections.askDuplicate(section.id)
            }}
            onSettings={() => sections.openSettings(section.id)}
            onDelete={() => {
              select(section.id)
              sections.askDelete(section.id)
            }}
            onSize={active ? layout.setToolbarSize : undefined}
            style={`top:${placement.top}px;left:${placement.left}px;`}
          />
        ))}
      {footer?.visible && (
        <FooterBar
          style={`top:${footer.top}px;left:${footer.left}px;`}
          onSize={layout.setFooterBarSize}
          onSettings={sections.openFooterSettings}
        />
      )}
      <AddMenu />
    </>
  )
}

function AddMenu() {
  const { ui, layout, overlay } = useEditor()
  const id = ui.addMenu.value
  const place = overlay.toolbarPlace.value
  if (!id || !overlay.toolbarVisible.value || !place) return null
  const choose = (where: InsertWhere) =>
    batch(() => {
      ui.picker.value = { id, where }
      ui.addMenu.value = null
    })
  return (
    <div
      class="bm-popover"
      style={`top:${place.top + layout.toolbarSize.value.height + 6}px;left:${place.left}px;`}
      role="menu"
      aria-label="Add section"
    >
      <button type="button" role="menuitem" onClick={() => choose('above')}>
        <Icon name="arrow-up" size={14} />
        Add above
      </button>
      <button type="button" role="menuitem" onClick={() => choose('below')}>
        <Icon name="arrow-down" size={14} />
        Add below
      </button>
    </div>
  )
}
