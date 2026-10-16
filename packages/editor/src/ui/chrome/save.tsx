import { useState, useRef, useEffect } from 'preact/hooks'
import { Icon } from '../icons.js'
import type { SaveAction } from '../types.js'

export type SaveStage = 'idle' | 'saving' | 'reloading'

const STAGE_LABEL: Record<SaveStage, string> = { idle: 'Save', saving: 'Saving…', reloading: 'Reloading…' }

/** Save with a menu of related actions behind an arrow, like a split button. */
export function SaveSplit({ onSave, actions, stage = 'idle' }: { onSave: () => void; actions: SaveAction[]; stage?: SaveStage }) {
  const busy = stage !== 'idle'
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    root.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus()
    const away = (event: Event) => {
      if (root.current && !event.composedPath().includes(root.current)) setOpen(false)
    }
    document.addEventListener('pointerdown', away, true)
    return () => document.removeEventListener('pointerdown', away, true)
  }, [open])
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && open) {
      // Close the menu first; a second Esc closes the sidebar.
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      toggle.current?.focus()
      return
    }
    if (!open || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return
    const items = [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [])]
    if (items.length === 0) return
    event.preventDefault()
    const rootNode = root.current?.getRootNode()
    const active = rootNode instanceof ShadowRoot ? rootNode.activeElement : document.activeElement
    const index = items.indexOf(active as HTMLElement)
    const step = event.key === 'ArrowDown' ? 1 : -1
    items[(index + step + items.length) % items.length]?.focus()
  }
  return (
    <div class="bm-split" ref={root} onKeyDown={onKeyDown}>
      <button type="button" class="bm-save bm-split-main" aria-keyshortcuts="Control+S" aria-busy={busy} disabled={busy} onClick={onSave}>
        {/* All three faces share one grid cell, so the button is as wide as the widest and never jumps. */}
        <span class="bm-faces">
          <span class="bm-face" hidden-face={busy ? '' : undefined}>
            Save
            <kbd aria-hidden="true">⌘S</kbd>
          </span>
          {(['saving', 'reloading'] as const).map((name) => (
            <span key={name} class="bm-face" hidden-face={stage === name ? undefined : ''}>
              <span class="bm-spin" aria-hidden="true" />
              {STAGE_LABEL[name]}
            </span>
          ))}
        </span>
      </button>
      <button
        type="button"
        ref={toggle}
        class="bm-save bm-split-toggle"
        aria-label="More actions"
        title="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="chevron-down" size={14} />
      </button>
      {open && (
        <div class="bm-split-menu" role="menu" aria-label="Save actions">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              role="menuitem"
              class={['bm-split-item', action.danger ? 'bm-split-danger' : '', action.separated ? 'bm-split-sep' : '']
                .filter(Boolean)
                .join(' ')}
              disabled={action.disabled}
              onClick={() => {
                setOpen(false)
                action.onSelect()
              }}
            >
              <span class="bm-split-label">{action.label}</span>
              {action.shortcut && <kbd aria-hidden="true">{action.shortcut}</kbd>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Saved / Unsaved status. While there are unsaved changes it opens the list of them. */
export function SavePill({ dirty, onReview }: { dirty: boolean; onReview: () => void }) {
  const dot = <span class="bm-dot" aria-hidden="true" />
  if (!dirty) {
    return (
      <span class="bm-pill">
        {dot}
        Saved
      </span>
    )
  }
  return (
    <button
      type="button"
      class="bm-pill bm-pill-dirty bm-pill-btn"
      aria-haspopup="dialog"
      title="Review unsaved changes"
      onClick={onReview}
    >
      {dot}
      Unsaved
    </button>
  )
}
