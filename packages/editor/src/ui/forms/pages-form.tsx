import { useState } from 'preact/hooks'
import { pageHref, suggestPageSlug } from '../../draft.js'
import { createEntry, deleteEntry } from '../api-client.js'
import { Icon } from '../icons.js'
import type { PageSummary } from '../types.js'
import { Field } from './fields.js'

/** The address a listed document is opened at. */
export const documentHref = (item: PageSummary): string => item.path ?? pageHref(item.slug)

/** The folder a listed document's file is in, inside the content directory. */
const folderOf = (item: PageSummary): string => (item.fixed === 'single' ? 'singles' : (item.type ?? 'pages'))

/**
 * The documents of one content type, with a form to add one. `Pages` is the built-in type, where the home page, the
 * 404 page and the site's singles are listed too; every type the site declares gets a list of its own.
 */
export function PagesForm({
  type = 'pages',
  path,
  heading = 'Pages',
  noun = 'page',
  pages,
  labels,
  isCurrent,
  canDelete,
  onCreated,
  onNavigate,
}: {
  /** Id of the content type new documents are created in. */
  type?: string
  /** Where an entry of this type is served, with `{slug}` for its slug: `/blog/{slug}`. Default: `/{slug}`. */
  path?: string
  heading?: string
  /** What one document of this type is called in buttons: `page` or `entry`. */
  noun?: 'page' | 'entry'
  pages: PageSummary[]
  /** The section types a new document may start from, by type. */
  labels: Record<string, string>
  isCurrent: (item: PageSummary) => boolean
  /** False when deleting is turned off for this type (`pages.delete`, or `delete: false` on a declared type). */
  canDelete: boolean
  onCreated: () => void
  onNavigate: (href: string) => void
}) {
  const start = noun === 'page' ? 'Notes' : 'Untitled'
  // Only the type's own entries hold a slug in its folder. A single or a listing page beside them is no clash.
  const taken = new Set(pages.filter((item) => !item.fixed && (item.type ?? 'pages') === type).map((item) => item.slug))
  const [title, setTitle] = useState(start)
  const [slug, setSlug] = useState(() => suggestPageSlug(start, taken))
  /** True once the slug was typed by hand: from then on the title no longer changes it. */
  const [slugTyped, setSlugTyped] = useState(false)
  const [error, setError] = useState('')
  const templates = Object.entries(labels)
  const [template, setTemplate] = useState(() => (labels.hero !== undefined ? 'hero' : (templates[0]?.[0] ?? '')))
  const [creating, setCreating] = useState(false)
  const pinned = (item: PageSummary) => item.system === true || item.fixed !== undefined
  return (
    <div class="bm-stack bm-stack-tight">
      <p class="bm-group bm-group-split">
        <span>{heading}</span>
        <button type="button" class="bm-small" aria-expanded={creating} onClick={() => setCreating((value) => !value)}>
          <Icon name="plus" size={12} />
          New {noun}
        </button>
      </p>
      <div class="bm-list">
        {pages.length === 0 && <p class="bm-note">No {noun === 'page' ? 'pages' : 'entries'} yet.</p>}
        {[...pages.filter((item) => !pinned(item)), ...pages.filter(pinned)].map((item) => {
          const current = isCurrent(item)
          return (
            <div class={current ? 'bm-list-row bm-list-row-on' : 'bm-list-row'} key={`${folderOf(item)}/${item.file}`}>
              <a
                href={documentHref(item)}
                onClick={(event) => {
                  event.preventDefault()
                  const href = documentHref(item)
                  const url = new URL(href, location.href)
                  if (url.pathname === location.pathname) return
                  onNavigate(href)
                }}
              >
                <span class="bm-list-title">{item.title}</span>
                <span class="bm-list-path" aria-hidden="true">
                  {item.sortValue !== undefined ? `${item.sortValue} · ` : ''}
                  {folderOf(item)}/{item.file}
                </span>
              </a>
              {item.slug === 'index' && item.type === undefined && (
                <span class="bm-badge bm-badge-home" title="Served at /">
                  <Icon name="home" size={11} />
                  home
                </span>
              )}
              {item.system && (
                <span class="bm-badge bm-badge-system" title="Built in: its content is editable, but it cannot be deleted or renamed">
                  system
                </span>
              )}
              {item.fixed && (
                <span
                  class="bm-badge bm-badge-system"
                  title={
                    item.fixed === 'listing'
                      ? 'The page that lists the entries. Its address is set in the content model, and it cannot be deleted or renamed'
                      : 'A single: one document at an address set in the content model. It cannot be deleted or renamed'
                  }
                >
                  {item.fixed === 'listing' ? 'listing' : 'fixed'}
                </span>
              )}
              {current && <span class="bm-badge bm-badge-on">editing</span>}
              {canDelete && !(item.slug === 'index' && item.type === undefined) && !current && !pinned(item) && (
                <button
                  type="button"
                  class="bm-icon-btn bm-danger"
                  aria-label={`Delete ${item.title}`}
                  title={`Delete ${noun}`}
                  onClick={() => {
                    void deleteEntry(item.type ?? 'pages', item.slug).then(() => onCreated())
                  }}
                >
                  <Icon name="trash" size={14} />
                </button>
              )}
            </div>
          )
        })}
      </div>
      {creating && (
        <div class="bm-card">
          <Field
            label="New title"
            value={title}
            onChange={(value) => {
              setTitle(value)
              if (!slugTyped) setSlug(suggestPageSlug(value, taken))
            }}
          />
          <Field
            label="New slug"
            value={slug}
            mono
            hint={`The ${noun} address. Made from the title until you change it, and the title never changes it afterwards.`}
            onChange={(value) => {
              setSlug(value)
              setSlugTyped(true)
            }}
          />
          <label class="bm-label">
            Template
            <select value={template} onChange={(event) => setTemplate(event.currentTarget.value)}>
              {templates.map(([sectionType, label]) => (
                <option key={sectionType} value={sectionType}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            class="bm-primary"
            disabled={slug === ''}
            onClick={() => {
              setError('')
              void createEntry(type, { slug, title, ...(template === '' ? {} : { template }) }).then((result) => {
                if (result.ok) onNavigate(path === undefined ? pageHref(slug) : path.replace('{slug}', slug))
                else setError(result.status === 0 ? `Could not create the ${noun}.` : result.message)
              })
            }}
          >
            Create {noun}
          </button>
          {error && <p class="bm-error">{error}</p>}
        </div>
      )}
    </div>
  )
}
