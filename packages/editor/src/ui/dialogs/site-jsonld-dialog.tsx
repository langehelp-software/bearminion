import { useEffect, useRef, useState } from 'preact/hooks'
import {
  type JsonLdBlock,
  type SiteJsonLdSource,
  formatJsonLd,
  generateSiteJsonLd,
  isPlaceholderSiteUrl,
  jsonLdWarnings,
  parseJsonLdInput,
  upsertJsonLd,
} from '../../json-ld.js'
import { Info } from '../info.js'
import { DialogClose } from './dialog.js'

/**
 * The structured data every page carries: an `Organization` and a `WebSite`, or any other markup. It edits a
 * copy: Apply writes it to the site draft in one step, Cancel and Escape drop it. Nothing reaches disk until save.
 */
export function SiteJsonLdDialog({
  blocks,
  source,
  onApply,
  onClose,
}: {
  blocks: JsonLdBlock[]
  /** What Generate reads: the site name, address, language and, when it has a full address, the logo. */
  source: SiteJsonLdSource
  onApply: (blocks: JsonLdBlock[]) => void
  onClose: () => void
}) {
  const root = useRef<HTMLDivElement>(null)
  const [jsonText, setJsonText] = useState(() => formatJsonLd(blocks))
  const parsed = parseJsonLdInput(jsonText)
  const warnings = parsed.ok ? jsonLdWarnings(parsed.value) : []
  const count = parsed.ok ? parsed.value.length : 0
  const placeholder = isPlaceholderSiteUrl(source.url)

  useEffect(() => {
    root.current?.querySelector<HTMLElement>('textarea')?.focus()
  }, [])

  function generate() {
    if (!parsed.ok) return
    setJsonText(formatJsonLd(upsertJsonLd(parsed.value, generateSiteJsonLd(source))))
  }

  return (
    <div class="bm-scrim">
      <div class="bm-dialog bm-seo" role="dialog" aria-modal="true" aria-label="Edit site JSON-LD" ref={root}>
        <div class="bm-dialog-head">
          <div class="bm-dialog-heading">
            <h2 class="bm-dialog-title">Structured data · every page</h2>
            <p class="bm-dialog-sub">Applied to the site draft. Nothing is written until you save.</p>
          </div>
          <DialogClose onClose={onClose} />
        </div>
        <div class="bm-seo-body">
          <div class="bm-stack">
            <p class="bm-group">Generate</p>
            <button type="button" class="bm-tertiary bm-seo-format" disabled={!parsed.ok} onClick={generate}>
              Generate Organization and WebSite
            </button>
            <p class="bm-hint">
              Filled from the site name, address and language. Blocks you already have with the same @id are replaced, the rest are kept.
              {source.logo
                ? ''
                : ' No logo is added: paste a full https address as "logo" by hand, because a local image only gets its address when the site is built.'}
            </p>
            {placeholder && (
              <span class="bm-error" role="alert">
                The site address is still {source.url}. Set the real one under Identity before you generate, or the markup names the wrong
                site.
              </span>
            )}
          </div>
          <div class="bm-stack">
            <p class="bm-group">JSON-LD</p>
            <label class="bm-label">
              <span class="bm-label-row">
                <span class="bm-label-text">
                  Blocks
                  <Info
                    label="About site JSON-LD"
                    text="Added to every page. A page's own JSON-LD replaces only the generated page markup, and a page block with the same @id wins over the site's. Paste an object, an array of objects, or a whole script tag."
                  />
                </span>
                <span class="bm-meta-tag">{parsed.ok ? `${count} ${count === 1 ? 'block' : 'blocks'}` : 'invalid'}</span>
              </span>
              <textarea
                class="bm-mono bm-seo-json"
                rows={14}
                spellcheck={false}
                autocomplete="off"
                placeholder={'{\n  "@context": "https://schema.org",\n  "@type": "Organization",\n  "name": "Example"\n}'}
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
        <div class="bm-actions">
          <button type="button" class="bm-primary" disabled={!parsed.ok} onClick={() => parsed.ok && onApply(parsed.value)}>
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
