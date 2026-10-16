import type { JSX } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { Icon } from './icons.js'
import {
  MAX_NAV_DEPTH,
  addNavChild,
  indentNav,
  linkWarning,
  moveNav,
  navHeight,
  outdentNav,
  pageHref,
  removeNavAt,
  type AnchorPage,
  type NavDrop,
  type NavLink,
} from '../draft.js'

export interface LinkPage {
  slug: string
  title: string
  anchors?: string[]
}

export function LinkControl({
  href,
  onChange,
  pages,
  currentSlug,
  currentAnchors,
}: {
  href: string
  onChange: (href: string) => void
  pages: readonly LinkPage[]
  currentSlug: string
  currentAnchors: readonly string[]
}) {
  const catalog: AnchorPage[] = pages.map((page) => ({
    slug: page.slug,
    anchors: page.slug === currentSlug ? currentAnchors : (page.anchors ?? []),
  }))
  if (!catalog.some((page) => page.slug === currentSlug)) {
    catalog.push({ slug: currentSlug, anchors: currentAnchors })
  }
  const inputId = useRef(`bm-url-${Math.random().toString(36).slice(2, 8)}`).current
  const warning = linkWarning(href, catalog, currentSlug)
  const pagesOptions = pages.map((page) => ({ value: pageHref(page.slug), label: page.title }))
  // A bare `#anchor` resolves against whatever page the visitor is on, so header and footer links would break elsewhere.
  const here = currentAnchors.map((anchor) => ({ value: `${pageHref(currentSlug)}#${anchor}`, label: `#${anchor}` }))
  const elsewhere = pages.flatMap((page) =>
    page.slug === currentSlug
      ? []
      : (page.anchors ?? []).map((anchor) => ({
          value: `${pageHref(page.slug)}#${anchor}`,
          label: `${page.title} #${anchor}`,
        })),
  )
  const groups: { label: string; options: { value: string; label: string }[] }[] = [
    { label: 'Pages', options: pagesOptions },
    { label: 'Anchors on this page', options: here },
    { label: 'Anchors on other pages', options: elsewhere },
  ]
  const all = groups.flatMap((group) => group.options)
  const current =
    all.find((option) => option.value === href) ??
    (href.startsWith('#') ? all.find((option) => option.value === `${pageHref(currentSlug)}${href}`) : undefined)
  return (
    <div class="bm-stack bm-stack-tight">
      <div class="bm-label">
        <label for={inputId}>URL</label>
        <div class="bm-linkfield">
          <input
            id={inputId}
            aria-label="Link URL"
            placeholder="https://… or pick a page"
            value={href}
            onInput={(event) => onChange(event.currentTarget.value)}
          />
          <TargetCombobox groups={groups} value={current?.value ?? ''} display={current ? current.label : 'Pages'} onPick={onChange} />
        </div>
      </div>
      {warning && <p class="bm-warn">{warning}</p>}
    </div>
  )
}

/** Searchable single-select. The list opens in flow under the trigger so it never clips inside the sidebar or a popover. */
function TargetCombobox({
  groups,
  value,
  display,
  onPick,
}: {
  groups: { label: string; options: { value: string; label: string }[] }[]
  value: string
  display: string
  onPick: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [box, setBox] = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const needle = query.trim().toLowerCase()
  const shown = groups
    .map((group) => ({
      ...group,
      options: group.options.filter((option) => !needle || `${option.label} ${option.value}`.toLowerCase().includes(needle)),
    }))
    .filter((group) => group.options.length > 0)
  const flat = shown.flatMap((group) => group.options)
  const everyOption = groups.flatMap((group) => group.options)
  const listId = useRef(`bm-combo-${Math.random().toString(36).slice(2, 8)}`).current

  useEffect(() => {
    if (!open) return
    search.current?.focus()
    const close = (event: Event) => {
      if (!event.composedPath().includes(root.current as EventTarget)) setOpen(false)
    }
    // The panel floats over the page (fixed), so it follows the trigger and flips up when the sidebar edge is too close.
    const place = () => {
      const rect = (trigger.current?.closest('.bm-linkfield') ?? trigger.current)?.getBoundingClientRect()
      if (!rect) return
      const room = window.innerHeight - rect.bottom
      const flip = room < 280 && rect.top > room
      setBox(
        flip
          ? { bottom: window.innerHeight - rect.top + 4, left: rect.left, width: rect.width }
          : { top: rect.bottom + 4, left: rect.left, width: rect.width },
      )
    }
    place()
    document.addEventListener('pointerdown', close, true)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      document.removeEventListener('pointerdown', close, true)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    root.current?.querySelector(`[id="${listId}-${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active, open, listId, box !== null])

  function pick(next: string) {
    onPick(next)
    setOpen(false)
    setQuery('')
    trigger.current?.focus()
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      trigger.current?.focus()
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => Math.min(flat.length - 1, index + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => Math.max(0, index - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const option = flat[active]
      if (option) pick(option.value)
    }
  }

  let index = -1
  return (
    <div class="bm-combo" ref={root} onKeyDown={open ? onKeyDown : undefined}>
      <button
        type="button"
        ref={trigger}
        class="bm-combo-trigger"
        role="combobox"
        aria-label="Link target"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => {
          setOpen((value) => !value)
          setQuery('')
          setActive(
            Math.max(
              0,
              everyOption.findIndex((option) => option.value === value),
            ),
          )
        }}
      >
        <span class={value ? undefined : 'bm-combo-custom'}>{display}</span>
        <Icon name="chevron-down" size={14} />
      </button>
      {open && box && (
        <div
          class="bm-combo-panel"
          style={`left:${box.left}px;width:${box.width}px;${box.top !== undefined ? `top:${box.top}px;` : `bottom:${box.bottom}px;`}`}
        >
          <input
            ref={search}
            type="search"
            aria-label="Search link targets"
            placeholder="Search pages and anchors"
            aria-controls={listId}
            aria-activedescendant={flat[active] ? `${listId}-${active}` : undefined}
            value={query}
            onInput={(event) => {
              setQuery(event.currentTarget.value)
              setActive(0)
            }}
          />
          <div class="bm-combo-list" role="listbox" id={listId} aria-label="Link targets">
            {flat.length === 0 && <p class="bm-combo-empty">No match. Type a URL below.</p>}
            {shown.map((group) => (
              <div role="group" aria-label={group.label} key={group.label}>
                <p class="bm-combo-group" aria-hidden="true">
                  {group.label}
                </p>
                {group.options.map((option) => {
                  index += 1
                  const position = index
                  return (
                    // biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/useFocusableInteractive: the combobox input owns focus and the keys (aria-activedescendant).
                    <div
                      key={option.value}
                      id={`${listId}-${position}`}
                      role="option"
                      aria-selected={option.value === value}
                      class={position === active ? 'bm-combo-option bm-combo-active' : 'bm-combo-option'}
                      onMouseMove={() => setActive(position)}
                      onClick={() => pick(option.value)}
                    >
                      <span>{option.label}</span>
                      <span class="bm-combo-value">{option.value}</span>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function NavForm({
  layout,
  links,
  pages,
  currentSlug,
  currentAnchors,
  actions,
  maxActions,
  onActions,
  onLinks,
}: {
  /** Header variant, tone and sticky switch, rendered above the links. */
  layout?: JSX.Element
  links: NavLink[]
  pages: readonly LinkPage[]
  currentSlug: string
  currentAnchors: readonly string[]
  /** Header buttons, left to right. */
  actions: NavLink[]
  /** The site definition's cap on header buttons. */
  maxActions: number
  onActions: (actions: NavLink[]) => void
  onLinks: (links: NavLink[]) => void
}) {
  return (
    <div class="bm-stack">
      {layout}
      <p class="bm-group">Header links</p>
      <p class="bm-note">
        Navigation nests up to {MAX_NAV_DEPTH} levels. Indent nests under the previous link. Drag a row: the top or bottom edge of another
        row places it above or below, the middle nests it. Desktop menus fly out; the mobile menu is an accordion.
      </p>
      <NavTree
        root={links}
        links={links}
        path={[]}
        pages={pages}
        currentSlug={currentSlug}
        currentAnchors={currentAnchors}
        onChange={onLinks}
      />
      <button type="button" class="bm-add" onClick={() => onLinks([...links, { label: 'New link', href: '/' }])}>
        Add link
      </button>
      <p class="bm-group bm-group-split">
        <span>Header actions</span>
        <span class="bm-small">
          {actions.length} / {maxActions}
        </span>
      </p>
      <p class="bm-note">Buttons at the right of the header, shown in this order. The last one is the primary button.</p>
      {actions.map((action, index) => (
        <div class="bm-card" key={index}>
          <div class="bm-card-head">
            <span class="bm-label">Button {index + 1}</span>
            <button
              type="button"
              class="bm-icon-btn bm-danger"
              aria-label={`Remove button ${index + 1}`}
              title="Remove button"
              onClick={() => onActions(actions.filter((_, at) => at !== index))}
            >
              <Icon name="trash" size={14} />
            </button>
          </div>
          <label class="bm-label">
            <span class="bm-label-row">
              <span>Label</span>
            </span>
            <input
              aria-label={`Button ${index + 1} label`}
              value={action.label}
              onInput={(event) =>
                onActions(actions.map((item, at) => (at === index ? { ...item, label: event.currentTarget.value } : item)))
              }
            />
          </label>
          <LinkControl
            href={action.href}
            pages={pages}
            currentSlug={currentSlug}
            currentAnchors={currentAnchors}
            onChange={(href) => onActions(actions.map((item, at) => (at === index ? { ...item, href } : item)))}
          />
        </div>
      ))}
      <button
        type="button"
        class="bm-add"
        disabled={actions.length >= maxActions}
        title={actions.length >= maxActions ? `Up to ${maxActions} buttons` : undefined}
        onClick={() => onActions([...actions, { label: 'Button', href: '/' }])}
      >
        Add button
      </button>
    </div>
  )
}

export interface FooterColumn {
  title: string
  links: NavLink[]
}

/**
 * Footer columns, managed like the header tree: add and remove columns, drag a column by its
 * header to reorder, and drag a link onto another column to move it there.
 */
export function FooterColumns({
  columns,
  maxColumns,
  onColumns,
  pages,
  currentSlug,
  currentAnchors,
}: {
  columns: FooterColumn[]
  /** The site definition's cap on footer columns. */
  maxColumns: number
  onColumns: (columns: FooterColumn[]) => void
  pages: readonly LinkPage[]
  currentSlug: string
  currentAnchors: readonly string[]
}) {
  const [dnd, setDnd] = useState<NavDrag>(NO_DRAG)
  const setLinks = (index: number, links: NavLink[]) =>
    onColumns(columns.map((column, at) => (at === index ? { ...column, links } : column)))

  function moveLink(from: DragSource, toScope: number, target: number[] | null, mode: NavDrop | 'end') {
    const destination = columns[toScope]
    if (!destination) return
    if (from.scope === toScope) {
      const links =
        target && mode !== 'end'
          ? moveNav(destination.links, from.path, target, mode)
          : moveNav(destination.links, from.path, [Math.max(0, destination.links.length - 1)], 'after')
      onColumns(columns.map((column, at) => (at === toScope ? { ...column, links } : column)))
      return
    }
    const source = removeNavAt(columns[from.scope]?.links ?? [], from.path)
    const appended = [...destination.links, structuredClone(from.link)]
    const placed = target && mode !== 'end' ? moveNav(appended, [appended.length - 1], target, mode) : appended
    onColumns(
      columns.map((column, at) => {
        if (at === from.scope) return { ...column, links: source }
        if (at === toScope) return { ...column, links: placed }
        return column
      }),
    )
  }

  function reorder(from: number, index: number, mode: 'before' | 'after') {
    const next = [...columns]
    const [moved] = next.splice(from, 1)
    if (!moved) return
    let to = mode === 'before' ? index : index + 1
    if (from < to) to -= 1
    next.splice(to, 0, moved)
    onColumns(next)
  }

  return (
    <div class="bm-stack">
      <p class="bm-group bm-group-split">
        <span>Columns</span>
        <span class="bm-small">
          {columns.length} / {maxColumns}
        </span>
      </p>
      <p class="bm-note">
        Drag a column by its header to reorder. Drag a link onto another column to move it. Columns sit at the right edge of the footer.
      </p>
      {columns.map((column, index) => {
        const over = dnd.over?.scope === index && dnd.over.key === '#col' ? dnd.over.mode : null
        const dragging = dnd.column === index
        return (
          <div
            class={['bm-card', 'bm-column', dragging ? 'bm-dragging' : '', dropClass(over)].filter(Boolean).join(' ')}
            key={index}
            data-drop-hint={over ? dropHint(over, column.title || `Column ${index + 1}`) : undefined}
            onDragOver={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              if (dnd.column !== null) {
                if (dnd.column === index) {
                  if (dnd.over) setDnd({ ...dnd, over: null })
                  return
                }
                const mode = event.clientY - rect.top < rect.height / 2 ? 'before' : 'after'
                const same = mode === 'before' ? dnd.column === index - 1 : dnd.column === index + 1
                if (same) {
                  if (dnd.over) setDnd({ ...dnd, over: null })
                  return
                }
                event.preventDefault()
                if (dnd.over?.scope !== index || dnd.over.key !== '#col' || dnd.over.mode !== mode) {
                  setDnd({ ...dnd, over: { scope: index, key: '#col', mode } })
                }
              } else if (dnd.from) {
                event.preventDefault()
                if (dnd.over?.scope !== index || dnd.over.key !== '#col' || dnd.over.mode !== 'end') {
                  setDnd({ ...dnd, over: { scope: index, key: '#col', mode: 'end' } })
                }
              }
            }}
            onDragLeave={(event) => {
              const next = event.relatedTarget
              if (next instanceof Node && event.currentTarget.contains(next)) return
              if (dnd.over?.scope === index && dnd.over.key === '#col') setDnd({ ...dnd, over: null })
            }}
            onDrop={(event) => {
              const mode = dnd.over?.scope === index && dnd.over.key === '#col' ? dnd.over.mode : null
              const { from, column: draggedColumn } = dnd
              if (!mode) return
              event.preventDefault()
              setDnd(NO_DRAG)
              if (draggedColumn !== null && (mode === 'before' || mode === 'after')) reorder(draggedColumn, index, mode)
              else if (from && mode === 'end') moveLink(from, index, null, 'end')
            }}
          >
            <div
              class="bm-column-head"
              draggable
              onDragStart={(event) => {
                if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
                setDnd({ from: null, column: index, over: null })
              }}
              onDragEnd={() => setDnd(NO_DRAG)}
            >
              <span class="bm-grip" aria-hidden="true">
                <Icon name="grip" size={12} />
              </span>
              <input
                class="bm-nav-label"
                aria-label={`Column ${index + 1} title`}
                value={column.title}
                onInput={(event) =>
                  onColumns(columns.map((item, at) => (at === index ? { ...item, title: event.currentTarget.value } : item)))
                }
              />
              <span class="bm-meta-tag">{column.links.length} links</span>
              <button
                type="button"
                class="bm-icon-btn bm-danger"
                aria-label={`Remove column ${index + 1}`}
                title="Remove column"
                onClick={() => onColumns(columns.filter((_, at) => at !== index))}
              >
                <Icon name="x" size={14} />
              </button>
            </div>
            <details class="bm-column-links">
              <summary>
                <span class="bm-chevron" aria-hidden="true">
                  <Icon name="chevron-right" size={14} />
                </span>
                Links
              </summary>
              <NavTree
                root={column.links}
                links={column.links}
                path={[]}
                pages={pages}
                currentSlug={currentSlug}
                currentAnchors={currentAnchors}
                onChange={(next) => setLinks(index, next)}
                scope={index}
                onMove={(from, toScope, target, mode) => moveLink(from, toScope, target, mode)}
                dnd={dnd}
                setDnd={setDnd}
              />
              <button type="button" class="bm-add" onClick={() => setLinks(index, [...column.links, { label: 'New link', href: '/' }])}>
                Add footer link
              </button>
            </details>
          </div>
        )
      })}
      <button
        type="button"
        class="bm-add"
        disabled={columns.length >= maxColumns}
        title={columns.length >= maxColumns ? `Up to ${maxColumns} columns` : undefined}
        onClick={() => onColumns([...columns, { title: 'New column', links: [] }])}
      >
        Add column
      </button>
    </div>
  )
}

/** A row being dragged: which tree it came from (scope), where, and the link itself. */
interface DragSource {
  scope: number
  path: number[]
  link: NavLink
}

export interface NavDrag {
  from: DragSource | null
  /** Index of a footer column being dragged by its header. */
  column: number | null
  /** What a drop at the pointer would do. `key` is a row path, or `#col` for a whole column. */
  over: { scope: number; key: string; mode: NavDrop | 'end' } | null
}

const NO_DRAG: NavDrag = { from: null, column: null, over: null }

function pathStartsWith(path: readonly number[], prefix: readonly number[]): boolean {
  return path.length >= prefix.length && prefix.every((value, index) => path[index] === value)
}

/** What a drop on this row would do: upper third above, lower third below, middle nests. Null when the drop is not allowed. */
function dropModeFor(from: DragSource, scope: number, target: number[], offsetRatio: number): NavDrop | null {
  if (from.scope === scope && pathStartsWith(target, from.path)) return null
  const canNest = target.length < MAX_NAV_DEPTH && target.length + navHeight(from.link) <= MAX_NAV_DEPTH
  if (offsetRatio < 0.3) return 'before'
  if (offsetRatio > 0.7) return 'after'
  return canNest ? 'child' : offsetRatio < 0.5 ? 'before' : 'after'
}

function dropHint(mode: NavDrop | 'end', label: string): string {
  const name = label.trim() || 'link'
  if (mode === 'before') return `Move above "${name}"`
  if (mode === 'after') return `Move below "${name}"`
  if (mode === 'end') return `Add to "${name}"`
  return `Nest under "${name}"`
}

function dropClass(mode: NavDrop | 'end' | null): string {
  if (mode === 'before') return 'bm-drop-before'
  if (mode === 'after') return 'bm-drop-after'
  if (mode === 'child' || mode === 'end') return 'bm-drop-child'
  return ''
}

function NavTree(props: {
  root: NavLink[]
  links: NavLink[]
  path: number[]
  pages: readonly LinkPage[]
  currentSlug: string
  currentAnchors: readonly string[]
  onChange: (links: NavLink[]) => void
  /** Which tree this is. Footer columns use their index so rows can move between them. */
  scope?: number
  /** Handles a drop. Without it the row moves inside `root`. */
  onMove?: (from: DragSource, scope: number, target: number[], mode: NavDrop) => void
  dnd?: NavDrag
  setDnd?: (next: NavDrag) => void
}) {
  const [ownedDnd, setOwnedDnd] = useState<NavDrag>(NO_DRAG)
  const dnd = props.dnd ?? ownedDnd
  const setDnd = props.setDnd ?? setOwnedDnd
  const scope = props.scope ?? 0
  const { root, links, path, pages, currentSlug, currentAnchors, onChange, onMove } = props
  return (
    <div class={path.length > 0 ? 'bm-stack bm-stack-tight bm-nested' : 'bm-stack bm-stack-tight'}>
      {links.map((link, index) => {
        const itemPath = [...path, index]
        const depth = itemPath.length
        const childHeight = navHeight(link)
        const canNestDeeper = depth < MAX_NAV_DEPTH && depth + childHeight <= MAX_NAV_DEPTH
        const key = itemPath.join('.')
        const over = dnd.over?.scope === scope && dnd.over.key === key ? dnd.over.mode : null
        const dragging = dnd.from !== null && dnd.from.scope === scope && pathsMatch(dnd.from.path, itemPath)
        const rowClass = ['bm-card', 'bm-nav-card', dragging ? 'bm-dragging' : '', dropClass(over)].filter(Boolean).join(' ')
        return (
          <div
            class={rowClass}
            key={key}
            data-drop-hint={over ? dropHint(over, link.label) : undefined}
            draggable
            onDragStart={(event) => {
              event.stopPropagation()
              if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
              setDnd({ from: { scope, path: itemPath, link }, column: null, over: null })
            }}
            onDragEnd={() => setDnd(NO_DRAG)}
            onDragOver={(event) => {
              // Only rows react to a dragged row. A dragged column passes through to its column card.
              if (!dnd.from) return
              event.stopPropagation()
              const rect = event.currentTarget.getBoundingClientRect()
              const mode = dropModeFor(dnd.from, scope, itemPath, (event.clientY - rect.top) / Math.max(1, rect.height))
              if (!mode) {
                if (dnd.over) setDnd({ ...dnd, over: null })
                return
              }
              event.preventDefault()
              if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
              if (dnd.over?.scope !== scope || dnd.over.key !== key || dnd.over.mode !== mode) {
                setDnd({ ...dnd, over: { scope, key, mode } })
              }
            }}
            onDragLeave={(event) => {
              if (!dnd.from) return
              const next = event.relatedTarget
              if (next instanceof Node && event.currentTarget.contains(next)) return
              if (dnd.over?.scope === scope && dnd.over.key === key) setDnd({ ...dnd, over: null })
            }}
            onDrop={(event) => {
              if (!dnd.from) return
              event.preventDefault()
              event.stopPropagation()
              const from = dnd.from
              const mode = dnd.over?.scope === scope && dnd.over.key === key && dnd.over.mode !== 'end' ? dnd.over.mode : null
              setDnd(NO_DRAG)
              if (!mode) return
              if (onMove) onMove(from, scope, itemPath, mode)
              else onChange(moveNav(root, from.path, itemPath, mode))
            }}
          >
            <div class="bm-nav-head">
              <span class="bm-grip" aria-hidden="true">
                <Icon name="grip" size={12} />
              </span>
              <input
                class="bm-nav-label"
                aria-label={depth === 1 ? 'Label' : 'Child label'}
                value={link.label}
                onInput={(event) => onChange(mapLink(root, itemPath, (item) => ({ ...item, label: event.currentTarget.value })))}
              />
              <button
                type="button"
                class="bm-icon-btn"
                aria-label="Indent"
                title="Indent under the previous link"
                disabled={index === 0 || !canNestDeeper}
                onClick={() => onChange(indentNav(root, itemPath))}
              >
                <Icon name="indent" size={14} />
              </button>
              <button
                type="button"
                class="bm-icon-btn"
                aria-label="Outdent"
                title="Outdent"
                disabled={depth === 1}
                onClick={() => onChange(outdentNav(root, itemPath))}
              >
                <Icon name="outdent" size={14} />
              </button>
              <button
                type="button"
                class="bm-icon-btn"
                aria-label="Add child"
                title={depth >= MAX_NAV_DEPTH ? 'Maximum depth reached' : 'Add child link'}
                disabled={depth >= MAX_NAV_DEPTH}
                onClick={() => onChange(addNavChild(root, itemPath, { label: 'Child', href: '/' }))}
              >
                <Icon name="plus" size={14} />
              </button>
              <button
                type="button"
                class="bm-icon-btn bm-danger"
                aria-label="Remove"
                title="Remove link"
                onClick={() => onChange(removeNavAt(root, itemPath))}
              >
                <Icon name="x" size={14} />
              </button>
            </div>
            <LinkControl
              href={link.href}
              pages={pages}
              currentSlug={currentSlug}
              currentAnchors={currentAnchors}
              onChange={(href) => onChange(mapLink(root, itemPath, (item) => ({ ...item, href })))}
            />
            {(link.children ?? []).length > 0 && (
              <NavTree
                root={root}
                links={link.children ?? []}
                path={itemPath}
                pages={pages}
                currentSlug={currentSlug}
                currentAnchors={currentAnchors}
                onChange={onChange}
                scope={scope}
                onMove={onMove}
                dnd={dnd}
                setDnd={setDnd}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function pathsMatch(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => b[index] === value)
}

function mapLink(links: NavLink[], path: number[], update: (link: NavLink) => NavLink): NavLink[] {
  const [head, ...rest] = path
  return links.map((link, index) => {
    if (index !== head) return link
    if (rest.length === 0) return update(link)
    return { ...link, children: mapLink(link.children ?? [], rest, update) }
  })
}
