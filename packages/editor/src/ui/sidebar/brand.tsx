import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import { BearMark } from '../bear-mark.js'

const NAME = 'BearMinion'
const SLOGAN = 'Git-based CMS'

/** True once any line in `node` is cut off. Hidden text keeps its layout, so the answer does not flip back and forth. */
function useOverflowing(node: { current: HTMLElement | null }): boolean {
  const [overflowing, setOverflowing] = useState(false)
  useLayoutEffect(() => {
    const element = node.current
    if (!element) return
    const check = () => setOverflowing([...element.children].some((line) => line.scrollWidth > line.clientWidth))
    check()
    const observer = new ResizeObserver(check)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return overflowing
}

/**
 * The bear, the name and the slogan. A narrow sidebar has no room for the text: rather than "B…", it fades out and
 * the same two lines show in a card when the pointer is over the brand.
 */
export function SidebarBrand() {
  const text = useRef<HTMLDivElement>(null)
  const compact = useOverflowing(text)
  return (
    <div class={compact ? 'bm-brand bm-brand-compact' : 'bm-brand'}>
      <BearMark class="bm-mark" />
      <div class="bm-head-text" ref={text}>
        <span class="bm-head-title">{NAME}</span>
        <span class="bm-head-sub">{SLOGAN}</span>
      </div>
      {compact && (
        // The sidebar's own label already names the editor, so screen readers skip the repeat.
        <div class="bm-brand-tip" aria-hidden="true">
          <span class="bm-head-title">{NAME}</span>
          <span class="bm-head-sub">{SLOGAN}</span>
        </div>
      )}
    </div>
  )
}
