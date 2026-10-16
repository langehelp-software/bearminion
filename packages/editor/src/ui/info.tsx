import type { ComponentChildren } from 'preact'
import { useEffect, useId, useRef, useState } from 'preact/hooks'
import { Icon } from './icons.js'

const GAP = 6
const MARGIN = 8

/**
 * Help for a field, kept out of the way: an info icon that shows the text in a tooltip on hover or focus, and pins it on
 * click or tap. It is a `role="button"` span, not a `<button>`, so inside a `<label>` it never steals the label from the input.
 * The tooltip stays in the DOM, so `aria-describedby` can point at it from the control.
 */
export function Info({ text, label = 'More info', id }: { text: ComponentChildren; label?: string; id?: string }) {
  const generated = useId()
  const tipId = id ?? `bm-tip-${generated.replace(/[^a-z0-9]+/gi, '')}`
  const trigger = useRef<HTMLSpanElement>(null)
  const tip = useRef<HTMLSpanElement>(null)
  const [hover, setHover] = useState(false)
  const [focus, setFocus] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [style, setStyle] = useState('')
  const shown = hover || focus || pinned

  useEffect(() => {
    if (!shown) return
    const anchor = trigger.current
    const bubble = tip.current
    if (!anchor || !bubble) return
    const place = () => {
      const a = anchor.getBoundingClientRect()
      const width = Math.min(260, window.innerWidth - MARGIN * 2)
      const height = bubble.offsetHeight
      const left = Math.max(MARGIN, Math.min(a.left + a.width / 2 - width / 2, window.innerWidth - width - MARGIN))
      const below = a.bottom + GAP + height <= window.innerHeight - MARGIN
      const top = below ? a.bottom + GAP : Math.max(MARGIN, a.top - GAP - height)
      setStyle(`left:${left}px;top:${top}px;width:${width}px;`)
    }
    place()
    window.addEventListener('resize', place)
    document.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      document.removeEventListener('scroll', place, true)
    }
  }, [shown])

  useEffect(() => {
    if (!pinned) return
    const away = (event: Event) => {
      const path = event.composedPath()
      if (trigger.current && path.includes(trigger.current)) return
      setPinned(false)
    }
    document.addEventListener('pointerdown', away, true)
    return () => document.removeEventListener('pointerdown', away, true)
  }, [pinned])

  return (
    <span class="bm-info">
      <span
        ref={trigger}
        class="bm-info-btn"
        role="button"
        tabIndex={0}
        aria-label={label}
        aria-describedby={tipId}
        aria-expanded={shown}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setPinned((value) => !value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            event.stopPropagation()
            setPinned((value) => !value)
          } else if (event.key === 'Escape' && shown) {
            // Close the tooltip first; a second Esc closes the sidebar.
            event.preventDefault()
            event.stopPropagation()
            setPinned(false)
            setHover(false)
            setFocus(false)
          }
        }}
      >
        <Icon name="info" size={13} />
      </span>
      <span ref={tip} id={tipId} role="tooltip" class={shown ? 'bm-tip bm-tip-open' : 'bm-tip'} style={style}>
        {text}
      </span>
    </span>
  )
}
