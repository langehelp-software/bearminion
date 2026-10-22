import { useState } from 'preact/hooks'
import type { PageDraft } from '../../draft.js'
import { isSystemPage } from '../../page.js'
import { Icon } from '../icons.js'
import { Info } from '../info.js'
import { Field } from './fields.js'
import { SeoCard } from './seo-card.js'

export function PageForm({
  page,
  labels,
  siteName,
  siteUrl,
  selectedId,
  onChange,
  savedSlug,
  onHomeChange,
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
  selectedId: string | null
  onChange: (page: PageDraft) => void
  /** Slug on disk. It differs from `page.slug` while a rename or a new home page is waiting for save. */
  savedSlug: string
  onHomeChange: (home: boolean) => void
  onEditSeo: () => void
  onSelectSection: (id: string) => void
  onMoveSection: (id: string, direction: -1 | 1) => void
  onReorderSections: (from: number, to: number) => void
  onDuplicateSection: (id: string) => void
  onRemoveSection: (id: string) => void
  onAddSection: (anchor: DOMRect) => void
}) {
  const [sectionDrag, setSectionDrag] = useState<{ from: number; over: number; mode: 'before' | 'after' } | null>(null)
  const isHome = page.slug === 'index'
  const isSystem = isSystemPage(page.slug)
  const savedHome = savedSlug === 'index'
  return (
    <>
      <div class="bm-stack">
        <p class="bm-group">Page · {page.title}</p>
        <Field label="Title" path="title" value={page.title} onChange={(value) => onChange({ ...page, title: value })} />
        <Field
          label="Slug"
          path="slug"
          value={page.slug}
          onChange={(value) => onChange({ ...page, slug: value })}
          disabled={isHome || isSystem}
          mono={isHome || isSystem}
          hint={
            isHome
              ? 'The home page is served at / and keeps the slug index.'
              : isSystem
                ? 'A system page: the site serves it for unknown addresses, so its slug is fixed and it stays out of search results.'
                : undefined
          }
        />
        {!isSystem && (
          <label class="bm-switch-row">
            <span class="bm-switch-text">
              <span class="bm-switch-title">
                Home page
                <Info
                  label="About Home page"
                  text={
                    savedHome
                      ? 'Set another page as home to move this one.'
                      : isHome
                        ? 'Becomes the home page when you save.'
                        : 'Serve this page at / instead of its own URL.'
                  }
                />
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={isHome}
              disabled={savedHome}
              onChange={(event) => onHomeChange(event.currentTarget.checked)}
            />
          </label>
        )}
      </div>
      <div class="bm-stack">
        <p class="bm-group">SEO</p>
        <SeoCard page={page} siteName={siteName} siteUrl={siteUrl} system={isSystem} onEdit={onEditSeo} />
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
