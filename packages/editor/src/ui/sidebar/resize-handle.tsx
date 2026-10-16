import { SIDEBAR_DEFAULT, sidebarBounds } from '../../sidebar.js'
import { useEditor } from '../state/editor.js'

/** Arrow keys move 16px, 48px with Shift. The sidebar is on the right, so ArrowLeft widens it. */
const KEY_STEP = 16
const KEY_STEP_LARGE = 48

function widthForKey(key: string, width: number, step: number): number | null {
  switch (key) {
    case 'ArrowLeft':
      return width + step
    case 'ArrowRight':
      return width - step
    case 'Home':
      return sidebarBounds(window.innerWidth).min
    case 'End':
      return sidebarBounds(window.innerWidth).max
    default:
      return null
  }
}

/** The sidebar's left edge: drag, arrow keys, Home and End resize it; a double click resets it. */
export function ResizeHandle() {
  const { ui, chrome } = useEditor()
  const width = ui.sidebarWidth.value
  const bounds = sidebarBounds(window.innerWidth)
  return (
    <div
      class="bm-resize"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuemin={bounds.min}
      aria-valuemax={bounds.max}
      aria-valuenow={width}
      tabIndex={0}
      onDblClick={() => chrome.resizeSidebar(SIDEBAR_DEFAULT)}
      onKeyDown={(event) => {
        const next = widthForKey(event.key, width, event.shiftKey ? KEY_STEP_LARGE : KEY_STEP)
        if (next === null) return
        event.preventDefault()
        chrome.resizeSidebar(next)
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.preventDefault()
        const startX = event.clientX
        const startWidth = width
        const handle = event.currentTarget
        handle.setPointerCapture(event.pointerId)
        const move = (pointer: PointerEvent) => chrome.resizeSidebar(startWidth + (startX - pointer.clientX))
        const up = () => {
          handle.removeEventListener('pointermove', move)
          handle.removeEventListener('pointerup', up)
        }
        handle.addEventListener('pointermove', move)
        handle.addEventListener('pointerup', up)
      }}
    />
  )
}
