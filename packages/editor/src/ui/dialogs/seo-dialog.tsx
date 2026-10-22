import { useEffect, useRef, useState } from 'preact/hooks'
import type { PageDraft } from '../../draft.js'
import { type JsonLdBlock, formatJsonLd, jsonLdWarnings, parseJsonLdInput } from '../../json-ld.js'
import { IssueContext } from '../context.js'
import { Field } from '../forms/fields.js'
import { SerpPreview } from '../forms/serp-preview.js'
import { type LibraryImage, ImageField } from '../image-field.js'
import { Info } from '../info.js'
import { text } from '../shared.js'
import type { Issue } from '../types.js'
import { DialogClose } from './dialog.js'

const OPTIONAL_TEXT = new Set(['canonical', 'ogImage'])

/**
 * Every SEO field of a page. It edits a copy: Apply writes it to the page draft in one step, Cancel and
 * Escape drop it. Nothing reaches disk until the page is saved.
 */
export function SeoDialog({
  page,
  siteName,
  siteUrl,
  system,
  images,
  issues,
  onUploaded,
  onDeleted,
  onApply,
  onClose,
}: {
  page: PageDraft
  siteName: string
  siteUrl: string
  /** A system page (404) is never indexed, so the indexing switches are fixed. */
  system: boolean
  images: LibraryImage[]
  issues: Issue[]
  onUploaded: (image: LibraryImage) => void
  onDeleted: (image: LibraryImage) => void
  onApply: (seo: Record<string, unknown>) => void
  onClose: () => void
}) {
  const root = useRef<HTMLDivElement>(null)
  const [seo, setSeo] = useState<Record<string, unknown>>(() => ({ ...page.seo }))
  const [jsonText, setJsonText] = useState(() =>
    formatJsonLd(Array.isArray(page.seo.jsonLd) ? (page.seo.jsonLd as JsonLdBlock[]) : undefined),
  )
  const parsed = parseJsonLdInput(jsonText)
  const warnings = parsed.ok ? jsonLdWarnings(parsed.value) : []

  useEffect(() => {
    root.current?.querySelector<HTMLElement>('input, textarea')?.focus()
  }, [])

  function set(key: string, value: unknown) {
    setSeo((current) => {
      const next = { ...current }
      if (OPTIONAL_TEXT.has(key) && (value === '' || value === undefined)) delete next[key]
      else next[key] = value
      return next
    })
  }

  function apply() {
    if (!parsed.ok) return
    const next = { ...seo }
    if (parsed.value.length > 0) next.jsonLd = parsed.value
    else delete next.jsonLd
    onApply(next)
  }

  const description = text(seo.description)
  const blocks = parsed.ok ? parsed.value.length : 0
  return (
    <div class="bm-scrim">
      <div class="bm-dialog bm-seo" role="dialog" aria-modal="true" aria-label="Edit SEO" ref={root}>
        <div class="bm-dialog-head">
          <div class="bm-dialog-heading">
            <h2 class="bm-dialog-title">SEO · {page.title}</h2>
            <p class="bm-dialog-sub">Applied to the page draft. Nothing is written until you save.</p>
          </div>
          <DialogClose onClose={onClose} />
        </div>
        <IssueContext.Provider value={issues}>
          <div class="bm-seo-body">
            <SerpPreview seo={seo} pageTitle={page.title} slug={page.slug} siteName={siteName} siteUrl={siteUrl} />
            <div class="bm-stack">
              <p class="bm-group">Search</p>
              <Field label="SEO title" path="seo.title" value={text(seo.title)} onChange={(value) => set('title', value)} />
              <Field
                label="Description"
                path="seo.description"
                value={description}
                onChange={(value) => set('description', value)}
                multiline
                meta={`${description.length} / 160`}
              />
              <Field
                label="Canonical"
                path="seo.canonical"
                value={text(seo.canonical)}
                onChange={(value) => set('canonical', value)}
                hint="Overrides the generated address. Absolute URL or a path on this site."
                mono
              />
            </div>
            <div class="bm-stack">
              <p class="bm-group">Social</p>
              <ImageField
                label="OG image"
                path="seo.ogImage"
                withAlt={false}
                value={{ src: text(seo.ogImage) }}
                images={images}
                onChange={(next) => set('ogImage', next.src)}
                onUploaded={onUploaded}
                onDeleted={onDeleted}
              />
            </div>
            {!system && (
              <div class="bm-stack">
                <p class="bm-group">Indexing</p>
                <label class="bm-switch-row">
                  <span class="bm-switch-text">
                    <span class="bm-switch-title">
                      noindex
                      <Info label="About noindex" text="Emits noindex and drops the page from the sitemap." />
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={seo.noindex === true}
                    onChange={(event) => set('noindex', event.currentTarget.checked)}
                  />
                </label>
                <label class="bm-switch-row">
                  <span class="bm-switch-text">
                    <span class="bm-switch-title">nofollow</span>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={seo.nofollow === true}
                    onChange={(event) => set('nofollow', event.currentTarget.checked)}
                  />
                </label>
              </div>
            )}
            <div class="bm-stack">
              <p class="bm-group">Structured data</p>
              <label class="bm-label">
                <span class="bm-label-row">
                  <span class="bm-label-text">
                    JSON-LD
                    <Info
                      label="About JSON-LD"
                      text="Replaces the WebPage markup the site generates. Paste an object, an array of objects, or a whole script tag. Leave empty to keep the generated markup."
                    />
                  </span>
                  <span class="bm-meta-tag">{parsed.ok ? `${blocks} ${blocks === 1 ? 'block' : 'blocks'}` : 'invalid'}</span>
                </span>
                <textarea
                  class="bm-mono bm-seo-json"
                  rows={12}
                  spellcheck={false}
                  autocomplete="off"
                  placeholder={'{\n  "@context": "https://schema.org",\n  "@type": "Article"\n}'}
                  aria-invalid={!parsed.ok}
                  value={jsonText}
                  onInput={(event) => setJsonText(event.currentTarget.value)}
                />
                {!parsed.ok && (
                  <span class="bm-error" role="alert">
                    {parsed.error}
                  </span>
                )}
                {warnings.map((warning) => (
                  <span class="bm-hint" key={warning}>
                    {warning}
                  </span>
                ))}
              </label>
              <button
                type="button"
                class="bm-tertiary bm-seo-format"
                disabled={!parsed.ok || parsed.value.length === 0}
                onClick={() => parsed.ok && setJsonText(formatJsonLd(parsed.value))}
              >
                Format JSON
              </button>
            </div>
          </div>
        </IssueContext.Provider>
        <div class="bm-actions">
          <button type="button" class="bm-primary" disabled={!parsed.ok} onClick={apply}>
            Apply
          </button>
          <button type="button" class="bm-tertiary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
