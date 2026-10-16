import { useRef, useLayoutEffect } from 'preact/hooks'
import { Icon } from '../icons.js'

/** Bar on the footer's top edge: its name and a settings button that opens the Footer tab. */
export function FooterBar({
  style,
  onSize,
  onSettings,
}: {
  style: string
  onSize: (size: { width: number; height: number }) => void
  onSettings: () => void
}) {
  const root = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const node = root.current
    if (node) onSize({ width: node.offsetWidth, height: node.offsetHeight })
  })
  return (
    <div class="bm-toolbar" role="toolbar" aria-label="Footer" data-footer-bar style={style} ref={root}>
      <span class="bm-toolbar-name">Footer</span>
      <span class="bm-sep" aria-hidden="true" />
      <button type="button" aria-label="Footer settings" title="Footer settings" onClick={onSettings}>
        <Icon name="settings" />
      </button>
    </div>
  )
}
