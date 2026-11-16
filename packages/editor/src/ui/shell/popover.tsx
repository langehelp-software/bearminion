import type { ComponentChildren } from 'preact'
import { useEffect, useRef } from 'preact/hooks'

/** Marks the buttons that open a top-bar popover, so pressing one toggles it rather than closing and reopening it. */
export const POPOVER_TRIGGER = 'data-bm-popover-trigger'

/** A popover under the top bar, right-aligned. A press anywhere outside it closes it; Escape is the shortcuts' job. */
export function TopBarPopover({ children, onClose }: { children: ComponentChildren; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const away = (event: Event) => {
      const path = event.composedPath()
      if (root.current && path.includes(root.current)) return
      if (path.some((node) => node instanceof Element && node.hasAttribute(POPOVER_TRIGGER))) return
      onClose()
    }
    document.addEventListener('pointerdown', away, true)
    return () => document.removeEventListener('pointerdown', away, true)
  }, [onClose])
  return (
    <div class="bm-topbar-pop" ref={root}>
      {children}
    </div>
  )
}
