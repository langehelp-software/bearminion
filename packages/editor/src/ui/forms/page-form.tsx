import { useState } from 'preact/hooks'
import type { PageDraft } from '../../draft.js'
import type { ContentTypeInfo } from '../../api-types.js'
import { isSystemPage } from '../../page.js'
import type { LibraryImage } from '../image-field.js'
import { Icon } from '../icons.js'
import { Field } from './fields.js'
import { Segmented } from './segmented.js'
import { SeoCard } from './seo-card.js'
import { TypeFieldsForm } from './type-fields-form.js'

export function PageForm({
  page,
  labels,
  siteName,
  siteUrl,
  siteOgImage,
  selectedId,
  onChange,
  canRename,
  kind = 'page',
  fixedReason,
  address,
  fields,
  images = [],
  onUploaded,
  onDeleted,
  onEditSeo,
  onSelectSection,
  onMoveSection,
  onReorderSections,
  onDuplicateSection,
  onRemoveSection,
  onAddSection,
}: {
  page: PageDraft
  labels: Record<string, string>
  siteName: string
  siteUrl: string
  siteOgImage: string
  selectedId: string | null
  onChange: (page: PageDraft) => void
  /** False when the slug cannot change: renaming is turned off, or the document has a fixed address. */
  canRename: boolean
  /** What is open: a page (the home and 404 pages included), an entry of a declared type, a single, or a listing page. */
  kind?: 'page' | 'entry' | 'single' | 'listing'
  /** Why the slug cannot change, when `canRename` is false. */
  fixedReason?: string
  /** The document's address when it is not `/<slug>`. */
  address?: string
  /** The fields the document's content type declares, or none. */
  fields?: ContentTypeInfo['fields']
  images?: LibraryImage[]
  onUploaded?: (image: LibraryImage) => void
  onDeleted?: (image: LibraryImage) => void
  onEditSeo: () => void
  onSelectSection: (id: string) => void
  onMoveSection: (id: string, direction: -1 | 1) => void
  onReorderSections: (from: number, to: number) => void
  onDuplicateSection: (id: string) => void
  onRemoveSection: (id: string) => void
  onAddSection: (anchor: DOMRect) => void
}) {
  const [sectionDrag, setSectionDrag] = useState<{ from: number; over: number; mode: 'before' | 'after' } | null>(null)
  // Only a page can be the home page or a system page: an entry called `index` is just an entry.
  const isHome = kind === 'page' && page.slug === 'index'
  const isSystem = kind === 'page' && isSystemPage(page.slug)
  const heading = { page: 'Page', entry: 'Entry', single: 'Page', listing: 'Listing page' }[kind]
  // Only a page or an entry at its own address can be a draft. A type with its own `draft` field keeps that switch.
  const hasStatus =
    (kind === 'page' && !isHome && !isSystem) || (kind === 'entry' && !(fields ?? []).some((field) => field.name === 'draft'))
  return (
    <>
      <div class="bm-stack">
        <p class="bm-group">
          {heading} · {page.title}
        </p>
        <Field label="Title" path="title" value={page.title} onChange={(value) => onChange({ ...page, title: value })} />
        <Field
          label="Slug"
          path="slug"
          value={page.slug}
          onChange={(value) => onChange({ ...page, slug: value })}
          disabled={isHome || isSystem || !canRename}
          mono={isHome || isSystem || !canRename}
          hint={
            isHome
              ? 'The home page is served at / and keeps the slug index.'
              : isSystem
                ? 'A system page: the site serves it for unknown addresses, so its slug is fixed and it stays out of search results.'
                : canRename
                  ? undefined
                  : (fixedReason ?? 'Renaming pages is turned off for this site, so this address stays as it is.')
          }
        />
        {hasStatus && (
          <div class="bm-stack bm-stack-tight">
            <Segmented
              label="Status"
              value={page.status === 'draft' ? 'draft' : 'published'}
              options={[
                { value: 'published', label: 'Published', dot: 'published' },
                { value: 'draft', label: 'Draft', dot: 'draft' },
              ]}
              onChange={(value) => {
                // Published is the default, so it is stored as no status at all: older files stay as they are.
                const { status: _status, ...rest } = page
                onChange(value === 'draft' ? { ...rest, status: 'draft' } : rest)
              }}
            />
            <p class="bm-hint">
              {page.status === 'draft' ? 'Left out of the build and the sitemap. Visible here in the editor.' : 'Included in the build.'}
            </p>
          </div>
        )}
        <label class="bm-switch-row">
          <span class="bm-switch-text">
            <span class="bm-switch-title">Show in search engines</span>
            <span class="bm-hint">
              {isSystem
                ? 'The 404 page always stays out of search results.'
                : page.seo.noindex === true
                  ? 'Marked noindex and left out of the sitemap.'
                  : 'Indexed and listed in the sitemap.'}
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            data-editor-field="seo.noindex"
            checked={!isSystem && page.seo.noindex !== true}
            disabled={isSystem}
            onChange={(event) => onChange({ ...page, seo: { ...page.seo, noindex: !event.currentTarget.checked } })}
          />
        </label>
      </div>
      {fields && fields.length > 0 && (
        <TypeFieldsForm
          fields={fields}
          values={page.fields ?? {}}
          images={images}
          onChange={(next) => onChange({ ...page, fields: next })}
          onUploaded={onUploaded ?? (() => {})}
          onDeleted={onDeleted ?? (() => {})}
        />
      )}
      <div class="bm-stack">
        <p class="bm-group">SEO</p>
        <SeoCard
          page={page}
          siteName={siteName}
          siteUrl={siteUrl}
          siteOgImage={siteOgImage}
          system={isSystem}
          address={address}
          onEdit={onEditSeo}
        />
      </div>
      <div class="bm-stack bm-stack-tight">
        <p class="bm-group">Sections · {page.sections.length}</p>
        <ol class="bm-outline-list">
          {page.sections.map((section, index) => {
            const label = labels[section.type] ?? section.type
            const name = `${label}${section.anchor ? ` #${section.anchor}` : ''}`
            const meta = [section.anchor ? `#${section.anchor}` : '', section.variant].filter(Boolean).join(' · ')
            const dragging = sectionDrag?.from === index
            const dropMode = sectionDrag && sectionDrag.over === index && sectionDrag.from !== index ? sectionDrag.mode : null
            return (
              <li
                key={section.id}
                class={[
                  'bm-srow',
                  dragging ? 'bm-dragging' : '',
                  dropMode === 'before' ? 'bm-drop-before' : '',
                  dropMode === 'after' ? 'bm-drop-after' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onDragOver={(event) => {
                  if (!sectionDrag) return
                  event.preventDefault()
                  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
                  const box = event.currentTarget.getBoundingClientRect()
                  const mode = event.clientY < box.top + box.height / 2 ? 'before' : 'after'
                  if (sectionDrag.over !== index || sectionDrag.mode !== mode) setSectionDrag({ ...sectionDrag, over: index, mode })
                }}
                onDrop={(event) => {
                  if (!sectionDrag) return
                  event.preventDefault()
                  const slot = sectionDrag.mode === 'before' ? index : index + 1
                  const to = slot > sectionDrag.from ? slot - 1 : slot
                  setSectionDrag(null)
                  if (to !== sectionDrag.from) onReorderSections(sectionDrag.from, to)
                }}
              >
                <span
                  class="bm-grip bm-srow-grip"
                  draggable
                  title="Drag to reorder"
                  aria-hidden="true"
                  onDragStart={(event) => {
                    const row = event.currentTarget.closest('li')
                    if (event.dataTransfer) {
                      event.dataTransfer.effectAllowed = 'move'
                      event.dataTransfer.setData('text/plain', section.id)
                      if (row) event.dataTransfer.setDragImage(row, 16, 16)
                    }
                    setSectionDrag({ from: index, over: index, mode: 'before' })
                  }}
                  onDragEnd={() => setSectionDrag(null)}
                >
                  <Icon name="grip" size={14} />
                </span>
                <button
                  type="button"
                  class={section.id === selectedId ? 'bm-outline-row bm-outline-row-on' : 'bm-outline-row'}
                  aria-label={`${index + 1}. ${label}${section.anchor ? ` · #${section.anchor}` : ''}`}
                  onClick={() => onSelectSection(section.id)}
                >
                  <span class={`bm-swatch bm-swatch-${section.tone}`} aria-hidden="true" />
                  <span class="bm-srow-text">
                    <span class="bm-srow-name">{label}</span>
                    {meta && <span class="bm-srow-meta">{meta}</span>}
                  </span>
                </button>
                <button
                  type="button"
                  class="bm-icon-btn bm-srow-btn"
                  aria-label={`Move ${name} up`}
                  title="Move up"
                  disabled={index === 0}
                  onClick={() => onMoveSection(section.id, -1)}
                >
                  <Icon name="arrow-up" size={13} />
                </button>
                <button
                  type="button"
                  class="bm-icon-btn bm-srow-btn"
                  aria-label={`Move ${name} down`}
                  title="Move down"
                  disabled={index === page.sections.length - 1}
                  onClick={() => onMoveSection(section.id, 1)}
                >
                  <Icon name="arrow-down" size={13} />
                </button>
                <button
                  type="button"
                  class="bm-icon-btn bm-srow-btn"
                  aria-label={`Duplicate ${name}`}
                  title="Duplicate"
                  onClick={() => onDuplicateSection(section.id)}
                >
                  <Icon name="copy" size={13} />
                </button>
                <button
                  type="button"
                  class="bm-icon-btn bm-srow-btn"
                  aria-label={`Settings for ${name}`}
                  title="Settings"
                  onClick={() => onSelectSection(section.id)}
                >
                  <Icon name="settings" size={13} />
                </button>
                <span class="bm-srow-sep" aria-hidden="true" />
                <button
                  type="button"
                  class="bm-icon-btn bm-srow-btn bm-danger"
                  aria-label={`Remove ${name}`}
                  title="Remove"
                  onClick={() => onRemoveSection(section.id)}
                >
                  <Icon name="trash" size={13} />
                </button>
              </li>
            )
          })}
        </ol>
        <div class="bm-srow-add">
          <button type="button" class="bm-add-section" onClick={(event) => onAddSection(event.currentTarget.getBoundingClientRect())}>
            <Icon name="plus" size={14} />
            Add section
          </button>
        </div>
      </div>
    </>
  )
}
