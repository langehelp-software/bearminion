import { useContext, useId, useRef, useState } from 'preact/hooks'
import {
  isImageField,
  type CountRule,
  isRichField,
  isHeadingField,
  isMultilineField,
  canAddItems,
  canRemoveItems,
  reorderList,
} from '../../draft.js'
import { sectionFieldKey } from '../../field-rules.js'
import { isOptionalPath, type OptionalContent, orderContentKeys } from '../../section-optional.js'
import { FieldsContext, LinksContext, OptionalContext, IssueContext } from '../context.js'
import { Icon } from '../icons.js'
import { type LibraryImage, ImageField } from '../image-field.js'
import { Info } from '../info.js'
import { isLinkRecord, isImageRecord, isRecord, text } from '../shared.js'
import type { Option } from '../types.js'
import { ChoiceField } from './choice-field.js'
import { FieldErrors, issuesFor } from './field-errors.js'
import { VideoSourceTools } from './video-source.js'

/** `yearlyDiscount` and `cta_label` read as "Yearly discount" and "Cta label". Array item numbers stay numbers. */
function humanize(key: string): string {
  if (/^\d+$/.test(key)) return key
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const LINK_KEYS = new Set(['primary', 'secondary', 'link', 'cta'])

/** A prop that is not in the draft: an empty input for text, an Add button for a link, an empty slot for an image. */
export function MissingField({
  name,
  path,
  sample,
  images,
  onField,
  onUploaded,
  onDeleted,
}: {
  name: string
  path: string
  sample: unknown
  images: LibraryImage[]
  onField: (path: string, value: unknown) => void
  onUploaded: (image: LibraryImage) => void
  onDeleted: (image: LibraryImage) => void
}) {
  const label = humanize(name)
  const fields = useContext(FieldsContext)
  const key = sectionFieldKey(path)
  const image = isImageField(name) || (key !== null && (fields.images?.includes(key) ?? false))
  if (LINK_KEYS.has(name)) {
    const fallback = { label: 'Button', href: '#' }
    return (
      <button
        type="button"
        class="bm-add bm-add-row"
        aria-label={`Add ${label.toLowerCase()}`}
        onClick={() => onField(path, isLinkRecord(sample) ? structuredClone(sample) : fallback)}
      >
        + Add {label.toLowerCase()}
      </button>
    )
  }
  return (
    <ValueEditor
      label={name}
      value={image ? { src: '', alt: '' } : ''}
      path={path}
      rule={undefined}
      variant={undefined}
      sample={undefined}
      images={images}
      onField={onField}
      onUploaded={onUploaded}
      onDeleted={onDeleted}
    />
  )
}

export function ValueEditor({
  label: rawLabel,
  value,
  path,
  rule,
  variant,
  sample,
  images,
  onField,
  onUploaded,
  onDeleted,
}: {
  label: string
  value: unknown
  path: string
  rule: CountRule | undefined
  variant: string | undefined
  sample: unknown
  images: LibraryImage[]
  onField: (path: string, value: unknown) => void
  onUploaded: (image: LibraryImage) => void
  onDeleted: (image: LibraryImage) => void
}) {
  const links = useContext(LinksContext)
  const optionalSpec = useContext(OptionalContext).content
  const optional = isOptionalPath(optionalSpec, path)
  const label = humanize(rawLabel)
  const fixed = useContext(FieldsContext)
  const key = sectionFieldKey(path)
  const choices = key === null ? undefined : fixed.choices?.[key]
  if (choices && (typeof value === 'string' || value === undefined)) {
    return (
      <ChoiceField
        label={label}
        path={path}
        value={value ?? ''}
        choices={choices}
        icons={key === null ? undefined : fixed.icons?.[key]}
        onChange={(next) => onField(path, next)}
      />
    )
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === undefined) {
    const rich = typeof value === 'string' && isRichField(path, null)
    const heading = isHeadingField(path)
    const control = (
      <OptionControl
        option={{
          name: path,
          label,
          type: typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : 'string',
          default: '',
        }}
        path={path}
        meta={heading ? 'select text to format' : rich ? 'markdown' : undefined}
        hint={optional ? 'Leave empty to hide it on the page.' : undefined}
        multiline={rich || (typeof value === 'string' && isMultilineField(path))}
        value={value}
        onChange={(next) => onField(path, next)}
      />
    )
    if (!/(^|\.)props\.video$/.test(path)) return control
    return (
      <div class="bm-stack bm-stack-tight">
        {control}
        <VideoSourceTools value={typeof value === 'string' ? value : ''} onPick={(url) => onField(path, url)} />
      </div>
    )
  }
  if (isImageRecord(value)) {
    return (
      <ImageField
        label={label}
        path={path}
        layout={!/(^|\.)logos\./.test(path)}
        hideable={path.startsWith('sections.') && !/(^|\.)logos\./.test(path)}
        captionable={isOptionalPath(optionalSpec, `${path}.caption`)}
        value={value}
        images={images}
        onChange={(next) => onField(path, next)}
        onUploaded={onUploaded}
        onDeleted={onDeleted}
      />
    )
  }
  if (Array.isArray(value)) {
    return (
      <ArrayEditor
        label={label}
        value={value}
        path={path}
        rule={rule}
        variant={variant}
        sample={sample}
        images={images}
        onField={onField}
        onUploaded={onUploaded}
        onDeleted={onDeleted}
      />
    )
  }
  if (isLinkRecord(value)) {
    const record = value as Record<string, unknown>
    return (
      <div class="bm-stack bm-stack-tight" data-editor-field={path}>
        <span class="bm-label-row bm-label">
          <span>{label}</span>
          {optional && (
            <button
              type="button"
              class="bm-icon-btn bm-danger"
              aria-label={`Remove ${label.toLowerCase()}`}
              title={`Remove ${label.toLowerCase()}`}
              onClick={() => onField(path, undefined)}
            >
              <Icon name="trash" size={13} />
            </button>
          )}
        </span>
        <button
          type="button"
          class="bm-link-btn"
          aria-label={`Edit link: ${label}`}
          onClick={(event) => links.editLink(path, value, event.currentTarget.getBoundingClientRect())}
        >
          <Icon name="link" size={14} />
          <span class="bm-link-label">{value.label || 'Untitled link'}</span>
          <span class="bm-link-href">{value.href}</span>
        </button>
        {Object.entries(record).map(([key, child]) =>
          key === 'label' || key === 'href' || key === 'children' || key === 'newTab' || key === 'id' || key === 'trackingId' ? null : (
            <ValueEditor
              key={key}
              label={key}
              value={child}
              path={`${path}.${key}`}
              rule={undefined}
              variant={variant}
              sample={undefined}
              images={images}
              onField={onField}
              onUploaded={onUploaded}
              onDeleted={onDeleted}
            />
          ),
        )}
      </div>
    )
  }
  if (typeof value === 'object' && value !== null) {
    return (
      <div class="bm-card">
        <span class="bm-label">{label}</span>
        {orderItemKeys(value as Record<string, unknown>, path, optionalSpec).map((key) =>
          key in (value as Record<string, unknown>) ? (
            <ValueEditor
              key={key}
              label={key}
              value={(value as Record<string, unknown>)[key]}
              path={`${path}.${key}`}
              rule={undefined}
              variant={variant}
              sample={undefined}
              images={images}
              onField={onField}
              onUploaded={onUploaded}
              onDeleted={onDeleted}
            />
          ) : (
            <MissingField
              key={key}
              name={key}
              path={`${path}.${key}`}
              sample={isRecord(sample) ? sample[key] : undefined}
              images={images}
              onField={onField}
              onUploaded={onUploaded}
              onDeleted={onDeleted}
            />
          ),
        )}
      </div>
    )
  }
  return null
}

/** First readable string inside an array item, for the collapsed row. */
function itemSummary(item: unknown): string {
  if (typeof item === 'string') return item
  if (typeof item === 'number') return String(item)
  if (Array.isArray(item)) return item.map(itemSummary).find(Boolean) ?? ''
  if (typeof item === 'object' && item !== null) {
    const record = item as Record<string, unknown>
    for (const key of ['title', 'name', 'label', 'q', 'quote', 'heading', 'value']) {
      const found = typeof record[key] === 'string' ? (record[key] as string) : ''
      if (found) return found
    }
    for (const child of Object.values(record)) {
      const found = itemSummary(child)
      if (found && !found.startsWith('src/') && found !== 'placeholder') return found
    }
  }
  return ''
}

export function OptionControl({
  option,
  value,
  onChange,
  path,
  meta,
  hint,
  multiline,
  segmented = false,
}: {
  option: Option
  value: unknown
  onChange: (value: unknown) => void
  path?: string
  meta?: string
  hint?: string
  multiline?: boolean
  /** A choice option with up to four choices shows as a segmented control instead of a select. */
  segmented?: boolean
}) {
  const issues = issuesFor(useContext(IssueContext), path)
  if (option.type === 'boolean') {
    const checked = value === true || (value === undefined && option.default === true)
    return (
      <label class="bm-switch-row">
        <span class="bm-switch-text">
          <span class="bm-switch-title">
            {option.label}
            {hint && <Info text={hint} label={`About ${option.label}`} />}
          </span>
          <FieldErrors issues={issues} />
        </span>
        <input type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} />
      </label>
    )
  }
  if (option.type === 'enum' && segmented) {
    return (
      <ChoiceField
        label={option.label}
        path={path}
        value={text(value || option.default)}
        choices={option.choices ?? []}
        onChange={(next) => onChange(next)}
      />
    )
  }
  if (option.type === 'enum') {
    return (
      <label class="bm-label">
        {option.label}
        <select value={text(value || option.default)} onChange={(event) => onChange(event.currentTarget.value)}>
          {(option.choices ?? []).map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </select>
        <FieldErrors issues={issues} />
      </label>
    )
  }
  if (option.type === 'number') {
    return (
      <label class="bm-label">
        {option.label}
        <input
          type="number"
          min={option.min}
          max={option.max}
          step="0.05"
          value={typeof value === 'number' ? value : Number(option.default)}
          onInput={(event) => onChange(Number(event.currentTarget.value))}
        />
        <FieldErrors issues={issues} />
      </label>
    )
  }
  return (
    <Field
      label={option.label}
      path={path}
      meta={meta}
      hint={hint}
      multiline={multiline}
      value={value === undefined || value === null ? '' : String(value)}
      onChange={(next) => onChange(next)}
    />
  )
}

export function Field({
  label,
  value,
  onChange,
  multiline = false,
  path,
  prefix,
  hint,
  meta,
  mono = false,
  onSelectRange,
  disabled = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  multiline?: boolean
  path?: string
  /** Fixed text shown before the input, such as `#` for an anchor. */
  prefix?: string
  /** Helper text under the field. */
  hint?: string
  /** Small mono tag right of the label, such as `markdown` or a character count. */
  meta?: string
  /** Paths, URLs and ids read better in mono. */
  mono?: boolean
  /** Reports the selected character range of the input. */
  onSelectRange?: (start: number, end: number) => void
  disabled?: boolean
}) {
  const issues = issuesFor(useContext(IssueContext), path)
  const generatedId = useId()
  const hintId = hint ? `bm-hint-${(path ?? generatedId).replace(/[^a-z0-9]+/gi, '-')}` : undefined
  const control = multiline ? (
    <textarea
      class={mono ? 'bm-mono' : undefined}
      value={value}
      disabled={disabled}
      aria-describedby={hintId}
      onInput={(event) => onChange(event.currentTarget.value)}
    />
  ) : (
    <input
      class={mono ? 'bm-mono' : undefined}
      value={value}
      disabled={disabled}
      aria-describedby={hintId}
      onInput={(event) => onChange(event.currentTarget.value)}
      onSelect={
        onSelectRange ? (event) => onSelectRange(event.currentTarget.selectionStart ?? 0, event.currentTarget.selectionEnd ?? 0) : undefined
      }
    />
  )
  const field = (
    <label class="bm-label">
      <span class="bm-label-row">
        <span class="bm-label-text">
          {label}
          {hint && <Info id={hintId} text={hint} label={`About ${label}`} />}
        </span>
        {meta && <span class="bm-meta-tag">{meta}</span>}
      </span>
      {prefix ? (
        <span class="bm-prefix-wrap">
          <span class="bm-prefix" aria-hidden="true">
            {prefix}
          </span>
          {control}
        </span>
      ) : (
        control
      )}
      <FieldErrors issues={issues} />
    </label>
  )
  return field
}

/** An array item's keys, plus the optional ones it has dropped, in the order the sample item lists them. */
function orderItemKeys(item: Record<string, unknown>, path: string, content: OptionalContent | undefined): string[] {
  const parts = path.replace(/^sections\.\d+\.props\./, '').split('.')
  const dropped = parts.length === 2 && /^\d+$/.test(parts[1] ?? '') ? (content?.items?.[parts[0] ?? ''] ?? []) : []
  return orderContentKeys(Object.keys(item), dropped, Object.keys(item))
}

let itemSeed = 0

/** Ids that follow each list item when it moves, so its open card, focus and inputs move with it. */
function useItemIds(length: number): { current: string[] } {
  const ids = useRef<string[]>([])
  while (ids.current.length < length) ids.current.push(`item-${++itemSeed}`)
  if (ids.current.length > length) ids.current.length = length
  return ids
}

interface ItemDrag {
  from: number
  over: number
  mode: 'before' | 'after'
}

/** Where a drop lands: the index the dragged item ends up at, or null when it would not move. */
function dropTarget(drag: ItemDrag): number | null {
  const slot = drag.mode === 'before' ? drag.over : drag.over + 1
  const to = slot > drag.from ? slot - 1 : slot
  return to === drag.from ? null : to
}

/** A list of items. Each card keeps its identity when it moves, so a card you moved stays open and you can move it again. */
function ArrayEditor({
  label,
  value,
  path,
  rule,
  variant,
  sample,
  images,
  onField,
  onUploaded,
  onDeleted,
}: {
  label: string
  value: unknown[]
  path: string
  rule: CountRule | undefined
  variant: string | undefined
  sample: unknown
  images: LibraryImage[]
  onField: (path: string, value: unknown) => void
  onUploaded: (image: LibraryImage) => void
  onDeleted: (image: LibraryImage) => void
}) {
  const allowAdd = canAddItems(value.length, rule, variant)
  const allowRemove = canRemoveItems(value.length, rule, variant)
  const ids = useItemIds(value.length)
  const list = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<ItemDrag | null>(null)

  function move(from: number, to: number, refocus?: 'up' | 'down') {
    if (from === to || to < 0 || to >= value.length) return
    const [id] = ids.current.splice(from, 1)
    if (id === undefined) return
    ids.current.splice(to, 0, id)
    onField(path, reorderList(value, from, to))
    if (!refocus) return
    // The card moved in the DOM, which drops focus. Put it back on the same button, or the other arrow at the end of the list.
    const wanted = id
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const card = list.current?.querySelector(`[data-item-id="${wanted}"]`)
        const first = card?.querySelector<HTMLButtonElement>(`[data-move="${refocus}"]`)
        const other = card?.querySelector<HTMLButtonElement>(`[data-move="${refocus === 'up' ? 'down' : 'up'}"]`)
        ;(first && !first.disabled ? first : other)?.focus()
      }),
    )
  }

  return (
    <div class="bm-stack bm-stack-tight">
      <span class="bm-label-row bm-label">
        <span>{label}</span>
        <span class="bm-meta-tag">
          {value.length}
          {rule?.recommended !== undefined ? `, recommended ${rule.recommended}` : ''}
        </span>
      </span>
      <div class="bm-array" ref={list}>
        {value.map((item, index) => {
          const id = ids.current[index] ?? `${path}.${index}`
          const target = drag !== null && drag.over === index ? dropTarget(drag) : null
          const mode = target === null || drag === null ? null : drag.mode
          const rowClass = [
            'bm-array-row',
            drag?.from === index ? 'bm-dragging' : '',
            mode === 'before' ? 'bm-drop-before' : '',
            mode === 'after' ? 'bm-drop-after' : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <div
              class={rowClass}
              key={id}
              data-item-id={id}
              data-drop-hint={mode ? 'Move here' : undefined}
              onDragOver={(event) => {
                if (!drag) return
                event.preventDefault()
                event.stopPropagation()
                if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
                const box = event.currentTarget.getBoundingClientRect()
                const next = event.clientY < box.top + box.height / 2 ? 'before' : 'after'
                if (drag.over !== index || drag.mode !== next) setDrag({ ...drag, over: index, mode: next })
              }}
              onDragLeave={(event) => {
                const next = event.relatedTarget
                if (!drag || (next instanceof Node && event.currentTarget.contains(next))) return
                if (drag.over === index) setDrag({ ...drag, over: drag.from })
              }}
              onDrop={(event) => {
                if (!drag) return
                event.preventDefault()
                event.stopPropagation()
                const to = dropTarget({ ...drag, over: index, mode: drag.over === index ? drag.mode : 'before' })
                const from = drag.from
                setDrag(null)
                if (to !== null) move(from, to)
              }}
            >
              <details class="bm-array-item">
                <summary>
                  <span
                    class="bm-grip bm-array-grip"
                    draggable
                    title="Drag to reorder"
                    aria-hidden="true"
                    onClick={(event) => event.preventDefault()}
                    onDragStart={(event) => {
                      event.stopPropagation()
                      const row = event.currentTarget.closest('.bm-array-row')
                      if (event.dataTransfer) {
                        event.dataTransfer.effectAllowed = 'move'
                        event.dataTransfer.setData('text/plain', id)
                        if (row) event.dataTransfer.setDragImage(row, 16, 16)
                      }
                      setDrag({ from: index, over: index, mode: 'before' })
                    }}
                    onDragEnd={() => setDrag(null)}
                  >
                    <Icon name="grip" size={12} />
                  </span>
                  <span class="bm-array-summary">{itemSummary(item) || `${label} ${index + 1}`}</span>
                  <span class="bm-chevron" aria-hidden="true">
                    <Icon name="chevron-right" size={14} />
                  </span>
                </summary>
                <div class="bm-array-body">
                  <ValueEditor
                    label={`${index + 1}`}
                    value={item}
                    path={`${path}.${index}`}
                    rule={undefined}
                    variant={variant}
                    sample={sample}
                    images={images}
                    onField={onField}
                    onUploaded={onUploaded}
                    onDeleted={onDeleted}
                  />
                  <div class="bm-row bm-row-end">
                    <button
                      type="button"
                      class="bm-icon-btn"
                      aria-label="Move item up"
                      title="Move up"
                      data-move="up"
                      disabled={index === 0}
                      onClick={() => move(index, index - 1, 'up')}
                    >
                      <Icon name="arrow-up" size={14} />
                    </button>
                    <button
                      type="button"
                      class="bm-icon-btn"
                      aria-label="Move item down"
                      title="Move down"
                      data-move="down"
                      disabled={index === value.length - 1}
                      onClick={() => move(index, index + 1, 'down')}
                    >
                      <Icon name="arrow-down" size={14} />
                    </button>
                    <button
                      type="button"
                      class="bm-icon-btn bm-danger"
                      aria-label="Remove item"
                      title="Remove"
                      disabled={!allowRemove}
                      onClick={() => {
                        ids.current.splice(index, 1)
                        onField(
                          path,
                          value.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                </div>
              </details>
            </div>
          )
        })}
        <button
          type="button"
          class="bm-add bm-add-row"
          disabled={!allowAdd}
          onClick={() => {
            const next = sample === undefined ? 'New' : structuredClone(sample)
            onField(path, [...value, next])
          }}
        >
          + Add item
        </button>
      </div>
    </div>
  )
}
