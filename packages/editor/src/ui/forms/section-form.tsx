import { type SectionDraft, suggestAnchor } from '../../draft.js'
import { orderContentKeys } from '../../section-optional.js'
import { OptionalContext } from '../context.js'
import { Icon } from '../icons.js'
import type { LibraryImage } from '../image-field.js'
import { text } from '../shared.js'
import type { Catalog } from '../types.js'
import { Field, OptionControl, MissingField, ValueEditor } from './fields.js'
import { Segmented } from './segmented.js'

const LAYOUT_OPTIONS = ['variant', 'tone', 'motion']

export function SectionForm({
  section,
  index,
  sections,
  catalog,
  siteMotion,
  taken,
  images,
  onField,
  onUploaded,
  onDeleted,
  onPreview,
  onSelect,
  onDuplicate,
  onDelete,
}: {
  section: SectionDraft
  index: number
  sections: SectionDraft[]
  catalog: Catalog
  siteMotion: boolean
  taken: Set<string>
  images: LibraryImage[]
  onField: (path: string, value: unknown) => void
  onUploaded: (image: LibraryImage) => void
  onDeleted: (image: LibraryImage) => void
  onPreview: () => void
  onSelect: (id: string) => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const options = catalog.sectionOptions[section.type] ?? []
  const shown = new Set(options.map((option) => option.name))
  const variantOption = options.find((option) => option.name === 'variant')
  const toneOption = options.find((option) => option.name === 'tone')
  const motionOption = options.find((option) => option.name === 'motion')
  const extraOptions = options.filter((option) => !LAYOUT_OPTIONS.includes(option.name))
  const pathFor = (name: string) => (LAYOUT_OPTIONS.includes(name) ? `sections.${index}.${name}` : `sections.${index}.props.${name}`)
  const set = (name: string, value: unknown) => {
    onField(pathFor(name), value)
    paintSection(section.id, name, name === 'motion' && value === undefined ? siteMotion : value)
    if (name === 'variant') onPreview()
  }
  const isUnknown = (item: SectionDraft) => !Object.hasOwn(catalog.sectionLabels, item.type)
  const labelOf = (item: SectionDraft) => (isUnknown(item) ? `Unknown (${item.type})` : (catalog.sectionLabels[item.type] ?? item.type))
  if (isUnknown(section)) {
    return (
      <div class="bm-stack" data-editor-field={`section:${section.id}`} tabIndex={-1}>
        <p class="bm-group">Section</p>
        <label class="bm-label">
          Editing
          <select value={section.id} onChange={(event) => onSelect(event.currentTarget.value)}>
            {sections.map((item, position) => (
              <option key={item.id} value={item.id}>
                {position + 1}. {labelOf(item)}
              </option>
            ))}
          </select>
        </label>
        <div class="bm-alert" role="status">
          <p class="bm-alert-title">
            <Icon name="alert" />
            This site has no "{section.type}" section
          </p>
          <p class="bm-alert-body">
            It is kept in the file as it is, but it is not shown in the preview, and the site build fails until you delete it. Add the
            section type back to the site, or delete this section.
          </p>
        </div>
        <p class="bm-meta">
          type: {section.type} · data-section-id: {section.id}
        </p>
        <div class="bm-actions-split">
          <button type="button" class="bm-danger" onClick={onDelete}>
            Delete section
          </button>
        </div>
      </div>
    )
  }
  return (
    <div class="bm-stack" data-editor-field={`section:${section.id}`} tabIndex={-1}>
      <div class="bm-stack">
        <p class="bm-group">Section</p>
        <label class="bm-label">
          Editing
          <select value={section.id} onChange={(event) => onSelect(event.currentTarget.value)}>
            {sections.map((item, position) => (
              <option key={item.id} value={item.id}>
                {position + 1}. {labelOf(item)}
                {item.anchor ? ` · #${item.anchor}` : ''}
              </option>
            ))}
          </select>
        </label>
        <div class="bm-stack bm-stack-tight">
          <Field
            label="Anchor"
            prefix="#"
            mono
            hint="Lowercase slug, unique on the page. Becomes the section's id for #links."
            path={`sections.${index}.anchor`}
            value={section.anchor ?? ''}
            onChange={(value) => {
              const anchor = value.trim()
              onField(`sections.${index}.anchor`, anchor === '' ? undefined : anchor)
              paintAnchor(section.id, anchor)
            }}
          />
          {!section.anchor && (
            <button
              type="button"
              class="bm-small"
              onClick={() => {
                const anchor = suggestAnchor(section, taken)
                onField(`sections.${index}.anchor`, anchor)
                paintAnchor(section.id, anchor)
              }}
            >
              Use suggestion ({suggestAnchor(section, taken)})
            </button>
          )}
        </div>
        <p class="bm-meta">
          type: {section.type} · data-section-id: {section.id}
        </p>
      </div>

      <div class="bm-stack">
        <p class="bm-group">Layout</p>
        {(variantOption || toneOption) && (
          <div class="bm-row-split">
            {variantOption && (
              <OptionControl
                option={variantOption}
                path={pathFor('variant')}
                value={getOptionValue(section, 'variant')}
                onChange={(value) => set('variant', value)}
              />
            )}
            {toneOption && (
              <label class="bm-label">
                Tone
                <select
                  value={section.tone ?? (text(toneOption.default) || 'base')}
                  onChange={(event) => set('tone', event.currentTarget.value)}
                >
                  {(toneOption.choices ?? []).map((choice) => (
                    <option key={choice} value={choice}>
                      {choice}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
        {motionOption && (
          <Segmented
            label="Motion"
            value={section.motion === undefined ? 'default' : section.motion ? 'on' : 'off'}
            options={[
              { value: 'default', label: 'Site default' },
              { value: 'on', label: 'On' },
              { value: 'off', label: 'Off' },
            ]}
            onChange={(value) => set('motion', value === 'default' ? undefined : value === 'on')}
          />
        )}
      </div>

      <p class="bm-group">Content</p>
      {extraOptions.map((option) => (
        <OptionControl
          key={option.name}
          option={option}
          path={pathFor(option.name)}
          value={getOptionValue(section, option.name)}
          onChange={(value) => set(option.name, value)}
        />
      ))}
      <OptionalContext.Provider value={{ content: catalog.optionalContent?.[section.type] }}>
        {orderContentKeys(
          Object.keys(section.props),
          catalog.optionalContent?.[section.type]?.props ?? [],
          Object.keys(catalog.sectionDefaults[section.type] ?? {}),
        ).map((key) => {
          if (shown.has(key) || key === 'marks') return null
          const path = `sections.${index}.props.${key}`
          const defaultValue = catalog.sectionDefaults[section.type]?.[key]
          if (!(key in section.props)) {
            return (
              <MissingField
                key={key}
                name={key}
                path={path}
                sample={defaultValue}
                images={images}
                onField={onField}
                onUploaded={onUploaded}
                onDeleted={onDeleted}
              />
            )
          }
          return (
            <ValueEditor
              key={key}
              label={key}
              value={section.props[key]}
              path={path}
              rule={catalog.contentCounts[section.type]?.[key]}
              variant={section.variant}
              sample={sampleItem(defaultValue)}
              onField={onField}
              images={images}
              onUploaded={onUploaded}
              onDeleted={onDeleted}
            />
          )
        })}
      </OptionalContext.Provider>

      <div class="bm-actions-split">
        <button type="button" onClick={onDuplicate}>
          Duplicate section
        </button>
        <button type="button" class="bm-danger" onClick={onDelete}>
          Delete section
        </button>
      </div>
    </div>
  )
}

function getOptionValue(section: SectionDraft, name: string): unknown {
  if (name === 'variant') return section.variant
  if (name === 'tone') return section.tone
  if (name === 'motion') return section.motion
  return section.props[name]
}

function paintAnchor(id: string, anchor: string) {
  const element = document.querySelector(`[data-section-id="${CSS.escape(id)}"]`)
  if (!(element instanceof HTMLElement)) return
  if (anchor) element.id = anchor
  else element.removeAttribute('id')
}

function paintSection(id: string, name: string, value: unknown) {
  const element = document.querySelector(`[data-section-id="${id}"]`)
  if (!(element instanceof HTMLElement)) return
  if (name === 'tone' || name === 'variant') element.setAttribute(`data-${name}`, String(value))
  if (name === 'motion') element.setAttribute('data-motion', value === false ? 'false' : 'true')
}

function sampleItem(value: unknown): unknown {
  if (!Array.isArray(value) || value.length === 0) return 'New'
  const first = value[0]
  if (typeof first === 'string') return 'New'
  if (first && typeof first === 'object') {
    const copy = structuredClone(first) as Record<string, unknown>
    for (const [key, child] of Object.entries(copy)) {
      if (typeof child === 'string' && key !== 'href' && key !== 'src') copy[key] = 'New'
    }
    return copy
  }
  return 'New'
}
