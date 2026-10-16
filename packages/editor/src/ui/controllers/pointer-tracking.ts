import { isImageField } from '../../draft.js'
import { fieldPathOf } from '../dom.js'
import type { Editor } from '../state/editor.js'
import type { Dispose } from './reactions.js'

/** Follows the pointer for hover outlines and the insert bar, and re-measures the overlay on scroll, resize and focus. */
export function attachPointerTracking({ ui, layout }: Editor): Dispose {
  const onPointerMove = (event: PointerEvent) => {
    if (ui.previewing.peek()) return
    const hit = layout.trackPointer(event.clientX, event.clientY)
    if (!hit.chrome) {
      if (hit.sectionId) ui.hoverId.value = hit.sectionId
      // Images open the picker on click, so they say so.
      document.documentElement.style.cursor = hit.field && isImageField(fieldPathOf(hit.field)) ? 'pointer' : ''
    }
    layout.schedule()
  }
  const remeasure = () => layout.schedule()

  document.addEventListener('pointermove', onPointerMove, true)
  window.addEventListener('scroll', remeasure, true)
  window.addEventListener('resize', remeasure)
  document.addEventListener('focusin', remeasure, true)
  document.addEventListener('focusout', remeasure, true)
  layout.schedule()
  return () => {
    document.documentElement.style.cursor = ''
    document.removeEventListener('pointermove', onPointerMove, true)
    window.removeEventListener('scroll', remeasure, true)
    window.removeEventListener('resize', remeasure)
    document.removeEventListener('focusin', remeasure, true)
    document.removeEventListener('focusout', remeasure, true)
  }
}
