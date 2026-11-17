import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import { Icon, type IconName } from '../icons.js'
import { useEditor } from '../state/editor.js'
import type { Toast, ToastTone } from '../state/toasts.js'

/** Toasts drawn behind the front one while the stack is collapsed. More are kept, just not painted. */
const VISIBLE_BEHIND = 2
/** How far each toast behind peeks out above the one in front, and how much smaller it is. */
const PEEK = 10
const SHRINK = 0.05
const GAP = 8
/** Room above the fanned-out stack for Dismiss all. */
const CLEAR_ROW = 34

const ICON: Record<ToastTone, IconName> = { error: 'alert', warning: 'alert', info: 'info' }

/**
 * Errors and warnings over the whole editor, bottom right. Collapsed, the newest is in front and older ones peek out
 * behind it; hover or keyboard focus fans the stack out so each can be read and dismissed.
 */
export function Toaster() {
  const { ui } = useEditor()
  const toasts = ui.toasts.list.value
  const [expanded, setExpanded] = useState(false)
  const [heights, setHeights] = useState<Record<number, number>>({})
  const nodes = useRef(new Map<number, HTMLElement>())

  // Measure after each render so the fanned-out stack knows where each toast starts.
  useLayoutEffect(() => {
    const next: Record<number, number> = {}
    let changed = Object.keys(heights).length !== toasts.length
    for (const toast of toasts) {
      const height = nodes.current.get(toast.id)?.offsetHeight ?? 0
      next[toast.id] = height
      if (heights[toast.id] !== height) changed = true
    }
    if (changed) setHeights(next)
  })

  // The stack collapses again once it is empty, so the next toast does not open fanned out.
  useLayoutEffect(() => {
    if (toasts.length === 0) setExpanded(false)
  }, [toasts.length])

  if (toasts.length === 0) return null
  const newestFirst = [...toasts].reverse()
  const front = newestFirst[0] as Toast
  const frontHeight = heights[front.id] ?? 0
  let offset = 0
  const placed = newestFirst.map((toast, index) => {
    const at = offset
    offset += (heights[toast.id] ?? 0) + GAP
    return { toast, index, at }
  })
  const stackHeight = expanded ? offset - GAP : frontHeight + Math.min(newestFirst.length - 1, VISIBLE_BEHIND) * PEEK
  // The Dismiss all button sits inside the toaster's box, so moving the pointer up to it keeps the stack open.
  const clearAll = expanded && toasts.length > 1

  return (
    <section
      class="bm-toaster"
      aria-label="Notifications"
      data-expanded={expanded || undefined}
      style={`height:${stackHeight + (clearAll ? CLEAR_ROW : 0)}px;`}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onFocusIn={() => setExpanded(true)}
      onFocusOut={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setExpanded(false)
      }}
    >
      {clearAll && (
        <button type="button" class="bm-toast-clear" onClick={ui.toasts.clear}>
          Dismiss all
        </button>
      )}
      <ol class="bm-toast-list">
        {placed.map(({ toast, index, at }) => {
          const hidden = !expanded && index > VISIBLE_BEHIND
          const transform = expanded ? `translateY(${-at}px)` : `translateY(${-index * PEEK}px) scale(${1 - index * SHRINK})`
          // Collapsed, a toast behind is cut to the front one's height so a longer one does not stick out above.
          const clip = !expanded && index > 0 && frontHeight > 0 ? `height:${frontHeight}px;overflow:hidden;` : ''
          return (
            <li
              key={toast.id}
              class={`bm-toast bm-toast-${toast.tone}`}
              role={toast.tone === 'error' ? 'alert' : 'status'}
              aria-hidden={hidden || undefined}
              inert={hidden || (!expanded && index > 0) || undefined}
              data-front={index === 0 || undefined}
              style={`z-index:${toasts.length - index};transform:${transform};opacity:${hidden ? 0 : 1};${clip}`}
              ref={(node) => {
                if (node) nodes.current.set(toast.id, node)
                else nodes.current.delete(toast.id)
              }}
            >
              <span class="bm-toast-icon">
                <Icon name={ICON[toast.tone]} size={16} />
              </span>
              <div class="bm-toast-copy">
                <p class="bm-toast-title">{toast.title}</p>
                {toast.lines.length > 0 && (
                  <ul class="bm-toast-lines">
                    {toast.lines.map((line, at) => (
                      <li key={`${at}:${line}`}>{line}</li>
                    ))}
                  </ul>
                )}
              </div>
              <button type="button" class="bm-toast-close" aria-label="Dismiss" title="Dismiss" onClick={() => ui.toasts.dismiss(toast.id)}>
                <Icon name="x" size={14} />
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
