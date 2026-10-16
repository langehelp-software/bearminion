import type { WireKind } from '../../wireframe.js'
import { DialogClose } from '../dialogs/dialog.js'
import { useEditor } from '../state/editor.js'

/** Wireframe fills for the Add section picker. Pure greyscale: theme colours never appear in it. */
const WIRE_FILL: Record<WireKind, string> = {
  title: 'background:oklch(0.35 0 0);border-radius:2px',
  text: 'background:oklch(0.82 0 0);border-radius:2px',
  block: 'background:oklch(0.9 0 0);border-radius:4px',
  button: 'background:oklch(0.45 0 0);border-radius:999px',
  outline: 'border:1px solid oklch(0.7 0 0);border-radius:999px;box-sizing:border-box',
  card: 'background:#fff;border-radius:4px;box-shadow:0 0 0 1px oklch(0.86 0 0)',
  highlight: 'background:#fff;border-radius:4px;box-shadow:0 0 0 1.5px oklch(0.4 0 0)',
  avatar: 'background:oklch(0.85 0 0);border-radius:50%',
  dark: 'background:oklch(0.3 0 0);border-radius:5px',
  light: 'background:#fff;border-radius:2px',
  figure: 'background:oklch(0.78 0 0);border-radius:2px',
}

/** Grid of section types with a wireframe each. Opens at a seam, under a section's bar, or from the sidebar. */
export function SectionPicker() {
  const { doc, ui, layout, overlay, sections } = useEditor()
  const picker = ui.picker.value
  const catalog = doc.catalog.value
  if (!picker || !catalog) return null
  const place = overlay.toolbarVisible.value ? overlay.toolbarPlace.value : null
  if (!picker.at && !place) return null
  const where = overlay.pickerWhere.value
  const style = picker.at
    ? `top:${picker.at.top}px;left:${picker.at.left}px;`
    : `top:${(place?.top ?? 0) + layout.toolbarSize.value.height + 6}px;left:${place?.left ?? 0}px;`
  return (
    <div class="bm-popover" style={style} role="listbox" aria-label="Add section">
      <div class="bm-picker-head">
        <span class="bm-picker-title" aria-hidden="true">
          Add section
        </span>
        {where && <span class="bm-picker-where">{where}</span>}
        <DialogClose
          onClose={() => {
            ui.picker.value = null
          }}
        />
      </div>
      <div class="bm-picker-grid">
        {Object.keys(catalog.sectionLabels).map((type) => {
          const label = catalog.sectionLabels[type] ?? type
          const variants = catalog.sectionOptions[type]?.find((option) => option.name === 'variant')?.choices?.length ?? 0
          const description = catalog.sectionDescriptions?.[type]
          return (
            <button type="button" key={type} aria-label={label} onClick={() => sections.insert(type, picker.where, picker.id)}>
              <span class="bm-wire" aria-hidden="true">
                {(catalog.sectionWireframes?.[type] ?? []).map(([x, y, w, h, kind], at) => (
                  <span key={at} style={`left:${x}%;top:${y}%;width:${w}%;height:${h}%;${WIRE_FILL[kind] ?? ''}`} />
                ))}
              </span>
              <span class="bm-type-text">
                <span class="bm-type-name">{label}</span>
                {variants > 0 && (
                  <span class="bm-type-variants">
                    {variants} {variants === 1 ? 'variant' : 'variants'}
                  </span>
                )}
                {description && <span class="bm-type-desc">{description}</span>}
              </span>
            </button>
          )
        })}
      </div>
      <p class="bm-picker-note">The new section starts with sample content. Nothing is written until you save.</p>
    </div>
  )
}
