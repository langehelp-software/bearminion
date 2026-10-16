import { useState } from 'preact/hooks'
import { pageHref } from '../../draft.js'
import { createPage, deletePage } from '../api-client.js'
import { Icon } from '../icons.js'
import type { PageSummary } from '../types.js'
import { Field } from './fields.js'

export function PagesForm({
  pages,
  labels,
  current,
  homeSlug,
  onCreated,
  onNavigate,
}: {
  pages: PageSummary[]
  labels: Record<string, string>
  current: string
  /** Slug of the page that is (or, once saved, will be) the home page. */
  homeSlug: string
  onCreated: () => void
  onNavigate: (href: string) => void
}) {
  const [slug, setSlug] = useState('notes')
  const [title, setTitle] = useState('Notes')
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
            {item.slug !== 'index' && item.slug !== current && !item.system && (
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
          <Field label="New slug" value={slug} onChange={setSlug} />
          <Field label="New title" value={title} onChange={setTitle} />
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
            onClick={() => {
              void createPage({ slug, title, template }).then((result) => {
                if (result.ok) onNavigate(pageHref(slug))
              })
            }}
          >
            Create page
          </button>
        </div>
      )}
    </div>
  )
}
