import { Icon } from '../icons.js'
import { useEditor } from '../state/editor.js'
import type { Seam } from '../state/overlay.js'

/** The gap picker is 640px wide and up to 440px tall; it opens under the seam, kept inside the viewport. */
function pickerBelow(seam: Seam): { top: number; left: number } {
  return {
    top: Math.max(8, Math.min(seam.y + 22, window.innerHeight - 440)),
    left: Math.max(8, Math.min((seam.left + seam.right) / 2 - 320, window.innerWidth - 648)),
  }
}

function lineStyle(seam: Seam): string {
  return `top:${seam.y}px;left:${seam.left}px;width:${Math.max(seam.right - seam.left, 0)}px;`
}

/** Between two sections, and above the first and below the last, a bar with a plus inserts a section there. */
export function InsertGap() {
  const { ui, overlay } = useEditor()
  const gap = overlay.gapBar.value
  const open = overlay.openGap.value
  const where = overlay.pickerWhere.value
  return (
    <>
      {gap && (
        <div class="bm-gap" style={lineStyle(gap)}>
          <button
            type="button"
            class="bm-gap-add"
            aria-label="Add section here"
            onClick={() => {
              ui.picker.value = { id: gap.id, where: gap.where, fromGap: true, at: pickerBelow(gap) }
              ui.selectedId.value = gap.id
            }}
          >
            <Icon name="plus" size={14} />
          </button>
        </div>
      )}
      {open && (
        <div class="bm-gap bm-gap-open" style={lineStyle(open)}>
          {where && <span class="bm-gap-chip">{where}</span>}
        </div>
      )}
    </>
  )
}
