import { useEffect, useRef, useState } from 'preact/hooks'
import {
  formatJsonLd,
  generateSiteJsonLd,
  isPlaceholderSiteUrl,
  type JsonLdBlock,
  type SiteJsonLdSource,
  upsertJsonLd,
} from '../../json-ld.js'
import { blockLabel, blockTexts, checkBlockText, JSON_LD_MAX_BLOCKS, JSON_LD_MAX_BYTES, jsonLdBytes } from '../../shell.js'
import { Icon } from '../icons.js'

const NEW_BLOCK = '{\n  "@context": "https://schema.org",\n  "@type": "Thing"\n}'

interface Card {
  /** Stable key, so typing in one card never remounts another. */
  id: number
  text: string
}

let nextId = 0
const cardsOf = (blocks: readonly JsonLdBlock[]): Card[] => blockTexts(blocks).map((text) => ({ id: nextId++, text }))

/** Every card's blocks, or null while one of them is not valid JSON-LD. */
function blocksOf(cards: readonly Card[]): JsonLdBlock[] | null {
  const out: JsonLdBlock[] = []
  for (const card of cards) {
    const state = checkBlockText(card.text)
    if (state.state === 'error') return null
    out.push(...state.blocks)
  }
  return out
}

/**
 * The structured data every page carries, one card per block. Valid edits go into the site draft as they are typed;
 * while a card is broken the draft keeps the last valid blocks. Same rules as the page JSON-LD: an object, an array
 * or a pasted `<script type="application/ld+json">` tag.
 */
export function JsonLdEditor({
  blocks,
  source,
  onChange,
}: {
  blocks: JsonLdBlock[]
  /** What Generate reads: the site name, address, language and, when it has a full address, the logo. */
  source: SiteJsonLdSource
  onChange: (blocks: JsonLdBlock[]) => void
}) {
  const [cards, setCards] = useState<Card[]>(() => cardsOf(blocks))
  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set())
  /** What this editor last wrote, so a change from elsewhere (undo, a restored version) reloads the cards. */
  const written = useRef(JSON.stringify(blocks))

  const stored = JSON.stringify(blocks)
  useEffect(() => {
    if (stored === written.current) return
    written.current = stored
    setCards(cardsOf(blocks))
  }, [stored])

  function commit(next: Card[]) {
    setCards(next)
    const valid = blocksOf(next)
    if (valid === null) return
    written.current = JSON.stringify(valid)
    onChange(valid)
  }

  const valid = blocksOf(cards)
  const bytes = jsonLdBytes(valid ?? blocks)
  const placeholder = isPlaceholderSiteUrl(source.url)
  const toggle = (id: number) => {
    const next = new Set(open)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setOpen(next)
  }

  return (
    <div class="bm-stack">
      <p class="bm-group bm-group-split">
        <span>Structured data · every page</span>
        <span class={bytes > JSON_LD_MAX_BYTES || cards.length > JSON_LD_MAX_BLOCKS ? 'bm-meta-tag bm-meta-over' : 'bm-meta-tag'}>
          {cards.length} / {JSON_LD_MAX_BLOCKS} · {(bytes / 1000).toFixed(1)} of {JSON_LD_MAX_BYTES / 1000} KB
        </span>
      </p>
      <p class="bm-hint">
        JSON-LD blocks added to every page, one script tag each. A page with its own JSON-LD replaces only the generated WebPage block; a
        page block with the same @id wins over the site's.
      </p>
      {cards.length > 0 && (
        <ul class="bm-jsonld-list">
          {cards.map((card, index) => {
            const state = checkBlockText(card.text)
            const label = blockLabel(card.text)
            const expanded = open.has(card.id)
            const badge = state.state === 'valid' ? 'valid' : state.state === 'warning' ? 'warning' : 'error'
            return (
              <li key={card.id} class="bm-jsonld-card">
                <div class="bm-jsonld-head">
                  <button
                    type="button"
                    class="bm-jsonld-toggle"
                    aria-expanded={expanded}
                    aria-controls={`bm-jsonld-${card.id}`}
                    onClick={() => toggle(card.id)}
                  >
                    <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={14} />
                    <span class="bm-jsonld-type">{label.type}</span>
                    {label.id && <span class="bm-jsonld-id">{label.id}</span>}
                  </button>
                  <span class={`bm-jsonld-badge bm-jsonld-${badge}`}>{badge}</span>
                  <button
                    type="button"
                    class="bm-icon-btn bm-danger"
                    aria-label={`Remove ${label.type}`}
                    title="Remove block"
                    onClick={() => commit(cards.filter((_, at) => at !== index))}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
                {expanded && (
                  <div class="bm-jsonld-body" id={`bm-jsonld-${card.id}`}>
                    <textarea
                      class={state.state === 'error' ? 'bm-mono bm-jsonld-text bm-jsonld-text-bad' : 'bm-mono bm-jsonld-text'}
                      rows={Math.min(16, Math.max(4, card.text.split('\n').length))}
                      spellcheck={false}
                      autocomplete="off"
                      aria-label={`${label.type} JSON-LD`}
                      aria-invalid={state.state === 'error'}
                      value={card.text}
                      onInput={(event) => {
                        const text = event.currentTarget.value
                        commit(cards.map((item) => (item.id === card.id ? { ...item, text } : item)))
                      }}
                    />
                    <div class="bm-jsonld-foot">
                      <span class={state.state === 'error' ? 'bm-error' : 'bm-hint'} role={state.state === 'error' ? 'alert' : undefined}>
                        {state.state === 'error' ? `${state.message} The draft keeps the last valid version.` : state.message}
                      </span>
                      <button
                        type="button"
                        class="bm-tertiary"
                        disabled={state.state === 'error'}
                        onClick={() => {
                          if (state.state === 'error') return
                          // An array or a pasted tag holding several blocks becomes one card per block.
                          const split = state.blocks.map((block, at) => ({
                            id: at === 0 ? card.id : nextId++,
                            text: formatJsonLd([block]),
                          }))
                          commit(cards.flatMap((item) => (item.id === card.id ? split : [item])))
                          setOpen(new Set([...open, ...split.map((item) => item.id)]))
                        }}
                      >
                        Format
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <button
        type="button"
        class="bm-dashed-add"
        disabled={cards.length >= JSON_LD_MAX_BLOCKS}
        onClick={() => {
          const card = { id: nextId++, text: NEW_BLOCK }
          commit([...cards, card])
          setOpen(new Set([...open, card.id]))
        }}
      >
        <Icon name="plus" size={14} />
        Add JSON-LD block
      </button>
      <button
        type="button"
        class="bm-tertiary bm-seo-format"
        disabled={valid === null}
        onClick={() => {
          if (valid === null) return
          const next = upsertJsonLd(valid, generateSiteJsonLd(source))
          setCards(cardsOf(next))
          written.current = JSON.stringify(next)
          onChange(next)
        }}
      >
        Generate Organization and WebSite
      </button>
      <p class="bm-hint">
        Filled from the site name, address and language. Blocks with the same @id are replaced, the rest are kept.
        {source.logo ? '' : ' No logo is added: a local image only gets its address when the site is built.'}
      </p>
      {placeholder && (
        <span class="bm-error" role="alert">
          The site address is still {source.url}. Set the real one on the Site screen before you generate, or the markup names the wrong
          site.
        </span>
      )}
    </div>
  )
}
