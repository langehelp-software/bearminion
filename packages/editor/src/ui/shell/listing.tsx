import type { ComponentChildren } from 'preact'
import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import {
  canDeleteRow,
  copySlug,
  DEFAULT_LISTING_SORT,
  filterRows,
  type ListingFilter,
  type ListingRow,
  type ListingSort,
  type ListingSortKey,
  paginate,
  relativeTime,
  sortRows,
  statusCounts,
} from '../../shell.js'
import { createEntry, deleteEntry } from '../api-client.js'
import { ConfirmDialog, DialogClose } from '../dialogs/dialog.js'
import { documentHref, NewDocumentForm } from '../forms/pages-form.js'
import { Icon } from '../icons.js'
import { ScrollLock } from '../scroll-lock.js'
import { useEditor } from '../state/editor.js'
import type { Catalog, PageSummary } from '../types.js'
import { isPagesListed } from './nav-items.js'
import { SaveIssues } from './panels.js'

const FILTERS: readonly { id: ListingFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'published', label: 'Published' },
  { id: 'draft', label: 'Draft' },
  { id: 'unsaved', label: 'Unsaved' },
]

const COLUMNS: readonly { key: ListingSortKey; label: string }[] = [
  { key: 'title', label: 'Title' },
  { key: 'path', label: 'URL' },
  { key: 'status', label: 'Status' },
  { key: 'indexed', label: 'Indexed' },
  { key: 'updatedAt', label: 'Last updated' },
]

const STATUS_LABEL = { published: 'Published', draft: 'Draft', unsaved: 'Unsaved' } as const

/** Where a listed document lives: `pages/about.json`, `singles/pricing.json`, `blog/first-post.json`. */
const fileOf = (item: PageSummary): string => `${item.fixed === 'single' ? 'singles' : (item.type ?? 'pages')}/${item.file}`

/** A row's key: a single, a listing page and an entry can share a slug, never a file. */
const rowKey = (item: PageSummary): string => fileOf(item)

type Pending = { action: 'delete'; items: PageSummary[] } | null

/**
 * Every document of one content type as a table: search, status tabs, sorting, bulk delete, row actions and pages of
 * ten. `pages` lists the home and 404 pages and the singles too.
 */
export function ListingView({ catalog, type }: { catalog: Catalog; type: string }) {
  const { doc, ui, session } = useEditor()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ListingFilter>('all')
  const [sort, setSort] = useState<ListingSort>(DEFAULT_LISTING_SORT)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [creating, setCreating] = useState(false)
  const [pending, setPending] = useState<Pending>(null)
  const [error, setError] = useState('')

  const pagesType = type === 'pages'
  const info = doc.types.value.find((item) => item.id === type)
  const label = pagesType ? 'Pages' : (info?.label ?? type)
  const noun = pagesType ? 'page' : 'entry'
  const storage = pagesType ? 'content/pages/{slug}.json' : `content/${info?.id ?? type}/{slug}.json`
  /** A type with its own `draft` field keeps using it; the others get a page status. */
  const draftField = !pagesType && (info?.fields ?? []).some((field) => field.name === 'draft')
  const canDelete = pagesType ? catalog.pageRules?.delete !== false : info?.delete !== false
  const ref = doc.ref.value
  const savedSlug = doc.savedSlug.value
  const pageDirty = doc.pageDirty.value
  const items = doc.pages.value.filter((item) => (pagesType ? isPagesListed(item) : item.type === type))
  const byKey = new Map(items.map((item) => [rowKey(item), item]))
  const isCurrent = (item: PageSummary) =>
    (item.type ?? 'pages') === ref.type &&
    (ref.kind === 'entry' ? item.fixed === undefined && item.slug === savedSlug : item.fixed === ref.kind)

  const rows: (ListingRow & { key: string })[] = items.map((item) => {
    const editing = isCurrent(item)
    return {
      key: rowKey(item),
      slug: item.slug,
      title: item.title,
      path: documentHref(item),
      status: editing && pageDirty ? 'unsaved' : item.draft ? 'draft' : 'published',
      indexed: item.noindex !== true && item.system !== true,
      ...(item.updatedAt ? { updatedAt: item.updatedAt } : {}),
      ...(item.slug === 'index' && item.type === undefined ? { home: true } : {}),
      ...(item.system ? { system: true } : {}),
      ...(item.fixed ? { fixed: true } : {}),
      ...(editing ? { editing: true } : {}),
    }
  })
  const counts = statusCounts(rows)
  const shown = useMemo(
    () => sortRows(filterRows(rows, query, filter), sort),
    [rows.map((row) => row.key + row.status).join(), query, filter, sort],
  )
  const current = paginate(shown, page)
  const deletable = (row: ListingRow) => canDelete && canDeleteRow(row) && !row.editing
  const pageKeys = current.rows.map((row) => row.key)
  const allOnPage = pageKeys.length > 0 && pageKeys.every((key) => selected.has(key))

  const taken = new Set(items.filter((item) => !item.fixed).map((item) => item.slug))
  const templates = (() => {
    const allowed = pagesType ? doc.types.value.find((item) => item.id === 'pages')?.sections : info?.sections
    return allowed
      ? Object.fromEntries(Object.entries(catalog.sectionLabels).filter(([id]) => allowed.includes(id)))
      : catalog.sectionLabels
  })()

  /** Back to the canvas first: the view is kept across a reload, and the document should open on the page. */
  const open = (path: string) => {
    ui.openView('canvas')
    if (new URL(path, location.href).pathname !== location.pathname) session.requestLeave(path)
  }

  function toggle(key: string) {
    const next = new Set(selected)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setSelected(next)
  }

  async function duplicate(item: PageSummary) {
    setError('')
    const slug = copySlug(item.slug, taken)
    const result = await createEntry(item.type ?? 'pages', {
      slug,
      title: `${item.title} (copy)`,
      template: item.slug,
      ...(draftField ? {} : { status: 'draft' as const }),
    })
    if (!result.ok) setError(result.message)
    await session.load()
  }

  async function remove(list: PageSummary[]) {
    setPending(null)
    setError('')
    const failed: string[] = []
    for (const item of list) {
      const result = await deleteEntry(item.type ?? 'pages', item.slug)
      if (!result.ok) failed.push(`${item.title}: ${result.message}`)
    }
    setSelected(new Set())
    if (failed.length > 0) setError(failed.join(' '))
    await session.load()
  }

  const sortBy = (key: ListingSortKey) => {
    setSort((previous) =>
      previous.key === key ? { key, dir: previous.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'updatedAt' ? 'desc' : 'asc' },
    )
    setPage(1)
  }
  const selectedItems = [...selected].flatMap((key) => {
    const item = byKey.get(key)
    const row = rows.find((candidate) => candidate.key === key)
    return item && row && deletable(row) ? [item] : []
  })

  return (
    <div class="bm-listing">
      <header class="bm-listing-head">
        <div class="bm-listing-heading">
          <div class="bm-listing-title-row">
            <h1 class="bm-screen-title">{label}</h1>
            <button type="button" class="bm-primary bm-listing-new" aria-haspopup="dialog" onClick={() => setCreating(true)}>
              <Icon name="plus" size={16} />
              New {noun}
            </button>
          </div>
          <p class="bm-screen-file">{storage}</p>
        </div>
        <label class="bm-listing-search">
          <Icon name="search" size={16} />
          <input
            type="search"
            placeholder={`Search ${label.toLowerCase()}`}
            aria-label={`Search ${label.toLowerCase()}`}
            value={query}
            onInput={(event) => {
              setQuery(event.currentTarget.value)
              setPage(1)
            }}
          />
        </label>
      </header>
      <SaveIssues />
      {creating && (
        <NewDocumentDialog noun={noun} storage={storage} onClose={() => setCreating(false)}>
          <NewDocumentForm
            type={type}
            path={pagesType ? undefined : info?.path}
            noun={noun}
            taken={taken}
            labels={templates}
            canDraft={!draftField}
            onNavigate={open}
          />
        </NewDocumentDialog>
      )}
      {error && (
        <p class="bm-error" role="alert">
          {error}
        </p>
      )}
      <div class="bm-listing-filters" role="tablist" aria-label="Status">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={filter === item.id}
            class={filter === item.id ? 'bm-filter bm-filter-on' : 'bm-filter'}
            onClick={() => {
              setFilter(item.id)
              setPage(1)
              setSelected(new Set())
            }}
          >
            {item.label}
            <span class="bm-filter-count">{counts[item.id]}</span>
          </button>
        ))}
      </div>
      {selected.size > 0 && (
        <div class="bm-bulk" role="region" aria-label="Selection">
          <span>{selected.size} selected</span>
          <button type="button" class="bm-bulk-clear" onClick={() => setSelected(new Set())}>
            Clear
          </button>
          <button
            type="button"
            class="bm-bulk-delete"
            disabled={selectedItems.length === 0}
            title={selectedItems.length === 0 ? 'None of the selected can be deleted' : undefined}
            onClick={() => setPending({ action: 'delete', items: selectedItems })}
          >
            <Icon name="trash" size={14} />
            Delete
          </button>
        </div>
      )}
      <div class="bm-table-wrap">
        <table class="bm-table" aria-label={label}>
          <colgroup>
            <col class="bm-col-check" />
            <col class="bm-col-title" />
            <col class="bm-col-url" />
            <col class="bm-col-status" />
            <col class="bm-col-indexed" />
            <col class="bm-col-time" />
          </colgroup>
          <thead>
            <tr class="bm-tr bm-thead">
              <th scope="col" class="bm-td bm-td-check">
                <input
                  type="checkbox"
                  aria-label="Select every row on this page"
                  checked={allOnPage}
                  disabled={pageKeys.length === 0}
                  onChange={() => {
                    const next = new Set(selected)
                    for (const key of pageKeys) {
                      if (allOnPage) next.delete(key)
                      else next.add(key)
                    }
                    setSelected(next)
                  }}
                />
              </th>
              {COLUMNS.map((column) => {
                const on = sort.key === column.key
                return (
                  <th
                    key={column.key}
                    scope="col"
                    class="bm-td"
                    aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <button type="button" class={on ? 'bm-th bm-th-on' : 'bm-th'} onClick={() => sortBy(column.key)}>
                      {column.label}
                      <span aria-hidden="true">{on ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span>
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {current.rows.length === 0 && (
              <tr>
                <td colSpan={6} class="bm-table-empty">
                  {query ? `Nothing matches “${query}”.` : `No ${pagesType ? 'pages' : 'entries'} here yet.`}
                </td>
              </tr>
            )}
            {current.rows.map((row) => {
              const item = byKey.get(row.key)
              if (!item) return null
              const checked = selected.has(row.key)
              return (
                <tr key={row.key} class={checked ? 'bm-tr bm-tr-on' : 'bm-tr'}>
                  <td class="bm-td bm-td-check">
                    <input type="checkbox" aria-label={`Select ${row.title}`} checked={checked} onChange={() => toggle(row.key)} />
                  </td>
                  <td class="bm-td bm-td-title">
                    <span class="bm-row-title-line">
                      <button type="button" class="bm-row-title" onClick={() => open(row.path)}>
                        {row.title}
                      </button>
                      {row.home && <span class="bm-chip bm-chip-amber">home</span>}
                      {row.system && (
                        <span class="bm-chip bm-chip-grey" title="Built-in page, can't be deleted">
                          system
                        </span>
                      )}
                      {item.fixed && (
                        <span class="bm-chip bm-chip-grey" title="One document at an address set in the content model">
                          {item.fixed === 'listing' ? 'listing' : 'single'}
                        </span>
                      )}
                      {row.editing && <span class="bm-chip bm-chip-green">editing</span>}
                    </span>
                    <span class="bm-row-actions">
                      <button type="button" onClick={() => open(row.path)}>
                        Edit
                      </button>
                      {!item.fixed && !row.system && (
                        <>
                          <span aria-hidden="true">|</span>
                          <button type="button" onClick={() => void duplicate(item)}>
                            Duplicate
                          </button>
                        </>
                      )}
                      <span aria-hidden="true">|</span>
                      <a href={row.path} target="_blank" rel="noopener">
                        View
                      </a>
                      {deletable(row) && (
                        <>
                          <span aria-hidden="true">|</span>
                          <button type="button" class="bm-row-delete" onClick={() => setPending({ action: 'delete', items: [item] })}>
                            Delete
                          </button>
                        </>
                      )}
                    </span>
                  </td>
                  <td class="bm-td bm-td-url">{row.path}</td>
                  <td class="bm-td">
                    <span class={`bm-status bm-status-${row.status}`}>
                      <span class="bm-dot" aria-hidden="true" />
                      {STATUS_LABEL[row.status]}
                    </span>
                  </td>
                  <td class="bm-td">{row.indexed ? 'Yes' : <span class="bm-mono-muted">noindex</span>}</td>
                  <td class="bm-td bm-td-time" title={row.updatedAt ? new Date(row.updatedAt).toLocaleString() : undefined}>
                    {relativeTime(row.updatedAt) || '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <footer class="bm-pager">
        <span>
          {current.range} {label.toLowerCase()}
        </span>
        {current.pages > 1 && (
          <span class="bm-pager-pages">
            <button type="button" aria-label="Previous page" disabled={current.page === 1} onClick={() => setPage(current.page - 1)}>
              ‹
            </button>
            {Array.from({ length: current.pages }, (_, index) => index + 1).map((number) => (
              <button
                key={number}
                type="button"
                class={number === current.page ? 'bm-pager-on' : undefined}
                aria-current={number === current.page ? 'page' : undefined}
                onClick={() => setPage(number)}
              >
                {number}
              </button>
            ))}
            <button
              type="button"
              aria-label="Next page"
              disabled={current.page === current.pages}
              onClick={() => setPage(current.page + 1)}
            >
              ›
            </button>
          </span>
        )}
      </footer>
      {pending && (
        <div
          class="bm-modal"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setPending(null)
          }}
        >
          <ScrollLock />
          <ConfirmDialog
            label={pending.items.length === 1 ? `Delete ${noun}` : `Delete ${pending.items.length} ${pagesType ? 'pages' : 'entries'}`}
            body={
              pending.items.length === 1 ? (
                <>
                  Delete <strong>{pending.items[0]?.title}</strong> and its file?
                </>
              ) : (
                <>Delete {pending.items.map((item) => item.title).join(', ')} and their files?</>
              )
            }
            note="The file is removed from disk now, not on the next save. Links to it will stop working."
            tone="danger"
            icon="trash"
            confirmLabel="Delete"
            danger
            onConfirm={() => void remove(pending.items)}
            onCancel={() => setPending(null)}
          />
        </div>
      )}
    </div>
  )
}

/**
 * The New page and New entry form, as a modal over the listing. Escape, the X and a click on the backdrop close it, and
 * focus goes back to the button that opened it.
 */
function NewDocumentDialog({
  noun,
  storage,
  onClose,
  children,
}: {
  noun: 'page' | 'entry'
  storage: string
  onClose: () => void
  children: ComponentChildren
}) {
  const dialog = useRef<HTMLDivElement>(null)
  // Before paint, so a key pressed the moment the dialog appears already reaches it.
  useLayoutEffect(() => {
    const node = dialog.current
    const rootNode = node?.getRootNode()
    const opener = rootNode instanceof ShadowRoot || rootNode instanceof Document ? rootNode.activeElement : null
    node?.querySelector<HTMLInputElement>('input')?.select()
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    node?.addEventListener('keydown', onKey)
    return () => {
      node?.removeEventListener('keydown', onKey)
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [])
  return (
    <div
      class="bm-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <ScrollLock />
      <div class="bm-modal bm-new-document" role="dialog" aria-modal="true" aria-label={`New ${noun}`} ref={dialog}>
        <div class="bm-modal-head">
          <h2 class="bm-dialog-title">New {noun}</h2>
          <span class="bm-meta-tag">{storage}</span>
          <DialogClose onClose={onClose} />
        </div>
        <div class="bm-modal-body">{children}</div>
      </div>
    </div>
  )
}
