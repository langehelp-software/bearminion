import { useState } from 'preact/hooks'
import { pageHref, suggestPageSlug } from '../../draft.js'
import { createPage, deletePage } from '../api-client.js'
import { Icon } from '../icons.js'
import type { PageSummary } from '../types.js'
import { Field } from './fields.js'

export function PagesForm({
  pages,
  labels,
  current,
  homeSlug,
  canDelete,
  onCreated,
  onNavigate,
}: {
  pages: PageSummary[]
  labels: Record<string, string>
  current: string
  /** Slug of the page that is (or, once saved, will be) the home page. */
  homeSlug: string
  /** False when the site turned page deletion off (`pages.delete`). */
  canDelete: boolean
  onCreated: () => void
  onNavigate: (href: string) => void
}) {
  const taken = new Set(pages.map((item) => item.slug))
  const [title, setTitle] = useState('Notes')
  const [slug, setSlug] = useState(() => suggestPageSlug('Notes', taken))
  /** True once the slug was typed by hand: from then on the title no longer changes it. */
  const [slugTyped, setSlugTyped] = useState(false)
  const [error, setError] = useState('')
  const [template, setTemplate] = useState('hero')
  const [creating, setCreating] = useState(false)
  return (
    <div class="bm-stack bm-stack-tight">
      <p class="bm-group bm-group-split">
        <span>Pages</span>
        <button type="button" class="bm-small" aria-expanded={creating} onClick={() => setCreating((value) => !value)}>
          <Icon name="plus" size={12} />
          New page
        </button>
      </p>
      <div class="bm-list">
        {[...pages.filter((item) => !item.system), ...pages.filter((item) => item.system)].map((item) => (
          <div class={item.slug === current ? 'bm-list-row bm-list-row-on' : 'bm-list-row'} key={item.slug}>
            <a
              href={pageHref(item.slug)}
              onClick={(event) => {
                event.preventDefault()
                const href = pageHref(item.slug)
                const url = new URL(href, location.href)
                if (url.pathname === location.pathname) return
                onNavigate(href)
              }}
            >
              <span class="bm-list-title">{item.title}</span>
              <span class="bm-list-path" aria-hidden="true">
                pages/{item.file}
              </span>
            </a>
            {item.slug === homeSlug && (
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
            {item.slug === current && <span class="bm-badge bm-badge-on">editing</span>}
            {canDelete && item.slug !== 'index' && item.slug !== current && !item.system && (
              <button
                type="button"
                class="bm-icon-btn bm-danger"
                aria-label={`Delete ${item.title}`}
                title="Delete page"
                onClick={() => {
                  void deletePage(item.slug).then(() => onCreated())
                }}
              >
                <Icon name="trash" size={14} />
              </button>
            )}
          </div>
        ))}
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
            hint="The page address. Made from the title until you change it, and the title never changes it afterwards."
            onChange={(value) => {
              setSlug(value)
              setSlugTyped(true)
            }}
          />
          <label class="bm-label">
            Template
            <select value={template} onChange={(event) => setTemplate(event.currentTarget.value)}>
              {Object.entries(labels).map(([type, label]) => (
                <option key={type} value={type}>
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
              void createPage({ slug, title, template }).then((result) => {
                if (result.ok) onNavigate(pageHref(slug))
                else setError(result.status === 0 ? 'Could not create the page.' : result.message)
              })
            }}
          >
            Create page
          </button>
          {error && <p class="bm-error">{error}</p>}
        </div>
      )}
    </div>
  )
}
