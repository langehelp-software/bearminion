import { useRef, useLayoutEffect } from 'preact/hooks'
import type { PageDraft } from '../../draft.js'
import { Icon } from '../icons.js'

export function SectionToolbar({
  page,
  id,
  active,
  label,
  onMove,
  onAdd,
  onDuplicate,
  onSettings,
  onDelete,
  onSize,
  style,
}: {
  page: PageDraft
  id: string
  /** The hovered or selected section. Its bar is named "Section"; the others carry their own name. */
  active: boolean
  label: string
  onMove: (direction: -1 | 1) => void
  onAdd: () => void
  onDuplicate: () => void
  onSettings: () => void
  onDelete: () => void
  onSize?: (size: { width: number; height: number }) => void
  style: string
}) {
  const root = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const node = root.current
    if (!node) return
    onSize?.({ width: node.offsetWidth, height: node.offsetHeight })
  })
  const index = page.sections.findIndex((section) => section.id === id)
  const anchor = page.sections[index]?.anchor
  const name = anchor ? `${label} · #${anchor}` : label
  // The active bar keeps the plain names. The others say which section they act on, so every name stays unique.
  const named = (action: string) => (active ? action : `${action} · ${name}`)
  return (
    <div
      class={active ? 'bm-toolbar bm-toolbar-active' : 'bm-toolbar'}
      role="toolbar"
      aria-label={active ? 'Section' : name}
      data-section-bar={id}
      style={style}
      ref={root}
    >
      <span class="bm-toolbar-name" title={name}>
        <span class="bm-toolbar-title">{label}</span>
        {anchor ? <span class="bm-toolbar-anchor"> · #{anchor}</span> : null}
      </span>
      <span class="bm-sep" aria-hidden="true" />
      <button type="button" aria-label={named('Move up')} title="Move up" disabled={index <= 0} onClick={() => onMove(-1)}>
        <Icon name="arrow-up" />
      </button>
      <button
        type="button"
        aria-label={named('Move down')}
        title="Move down"
        disabled={index < 0 || index >= page.sections.length - 1}
        onClick={() => onMove(1)}
      >
        <Icon name="arrow-down" />
      </button>
      <span class="bm-sep" aria-hidden="true" />
      <button type="button" aria-label={named('Add')} title="Add" onClick={onAdd}>
        <Icon name="plus" />
      </button>
      <button type="button" aria-label={named('Duplicate')} title="Duplicate" onClick={onDuplicate}>
        <Icon name="copy" />
      </button>
      <span class="bm-sep" aria-hidden="true" />
      <button type="button" aria-label={named('Settings')} title="Settings" onClick={onSettings}>
        <Icon name="settings" />
      </button>
      <span class="bm-sep" aria-hidden="true" />
      <button type="button" class="bm-danger" aria-label={named('Delete')} title="Delete" onClick={onDelete}>
        <Icon name="trash" />
      </button>
    </div>
  )
}
