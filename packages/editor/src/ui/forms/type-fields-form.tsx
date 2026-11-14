import type { ContentTypeInfo } from '../../api-types.js'
import { ImageField, type LibraryImage } from '../image-field.js'
import { Field } from './fields.js'

type FieldInfo = NonNullable<ContentTypeInfo['fields']>[number]
type Schema = Record<string, unknown>

/** `publishDate` and `publish_date` both read "Publish date". */
export function fieldLabel(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** The schema that holds the value: an optional field is described as "this or nothing". */
function valueSchema(schema: Schema): Schema {
  const options = (schema.anyOf ?? schema.oneOf) as Schema[] | undefined
  if (!Array.isArray(options)) return schema
  return options.find((option) => option.type !== 'null') ?? schema
}

export type FieldWidget = 'text' | 'longText' | 'date' | 'number' | 'boolean' | 'choice' | 'image' | 'imagePath' | 'list' | 'none'

/** Which control edits a field, from its JSON Schema. `none` is shown as it is and edited in the file. */
export function widgetFor(field: FieldInfo): FieldWidget {
  if (field.readOnly || field.schema === null) return 'none'
  const schema = valueSchema(field.schema)
  if (Array.isArray(schema.enum) && schema.enum.every((choice) => typeof choice === 'string')) return 'choice'
  if (schema.type === 'boolean') return 'boolean'
  if (schema.type === 'number' || schema.type === 'integer') return 'number'
  if (schema.type === 'string') {
    if (schema.bearminion === 'image') return 'imagePath'
    if (schema.format === 'date') return 'date'
    return typeof schema.maxLength === 'number' && schema.maxLength <= 120 ? 'text' : schema.maxLength === undefined ? 'text' : 'longText'
  }
  if (schema.type === 'array' && (schema.items as Schema | undefined)?.type === 'string') return 'list'
  const properties = schema.properties as Record<string, unknown> | undefined
  if (schema.type === 'object' && properties && 'src' in properties && 'alt' in properties) return 'image'
  return 'none'
}

/** `fields` with `name` set, or without it when an optional field was emptied: an optional date cannot be "". */
export function setTypeField(fields: Record<string, unknown>, field: FieldInfo, value: unknown): Record<string, unknown> {
  const empty = value === undefined || value === '' || (Array.isArray(value) && value.length === 0 && !field.required)
  if (empty && !field.required) {
    const { [field.name]: _removed, ...rest } = fields
    return rest
  }
  return { ...fields, [field.name]: value }
}

/**
 * The fields a content type declares for its documents (a post's date, excerpt and cover), drawn from the type's
 * schema. The schema validates the save; this form only picks a fitting control for each field.
 */
export function TypeFieldsForm({
  fields,
  values,
  images,
  onChange,
  onUploaded,
  onDeleted,
}: {
  fields: readonly FieldInfo[]
  values: Record<string, unknown>
  images: LibraryImage[]
  onChange: (next: Record<string, unknown>) => void
  onUploaded: (image: LibraryImage) => void
  onDeleted: (image: LibraryImage) => void
}) {
  return (
    <div class="bm-stack">
      <p class="bm-group">Fields</p>
      {fields.map((field) => {
        const label = fieldLabel(field.name)
        const path = `fields.${field.name}`
        const value = values[field.name]
        const set = (next: unknown) => onChange(setTypeField(values, field, next))
        const widget = widgetFor(field)
        const schema = field.schema === null ? {} : valueSchema(field.schema)
        const hint = field.required ? undefined : 'Optional.'
        if (widget === 'boolean') {
          return (
            <label class="bm-switch-row" key={field.name}>
              <span class="bm-switch-text">
                <span class="bm-switch-title">{label}</span>
              </span>
              <input type="checkbox" role="switch" checked={value === true} onChange={(event) => set(event.currentTarget.checked)} />
            </label>
          )
        }
        if (widget === 'choice') {
          const choices = schema.enum as string[]
          return (
            <label class="bm-label" key={field.name}>
              {label}
              <select value={typeof value === 'string' ? value : ''} onChange={(event) => set(event.currentTarget.value)}>
                {(!field.required || typeof value !== 'string') && <option value="">{field.required ? 'Choose…' : 'None'}</option>}
                {choices.map((choice) => (
                  <option key={choice} value={choice}>
                    {choice}
                  </option>
                ))}
              </select>
            </label>
          )
        }
        if (widget === 'date' || widget === 'number') {
          return (
            <label class="bm-label" key={field.name}>
              {label}
              {widget === 'date' ? (
                <input type="date" value={typeof value === 'string' ? value : ''} onInput={(event) => set(event.currentTarget.value)} />
              ) : (
                <input
                  type="number"
                  value={typeof value === 'number' ? String(value) : ''}
                  onInput={(event) => set(event.currentTarget.value === '' ? '' : Number(event.currentTarget.value))}
                />
              )}
              {hint && <span class="bm-hint">{hint}</span>}
            </label>
          )
        }
        if (widget === 'image' || widget === 'imagePath') {
          const current =
            widget === 'image'
              ? (value as { src?: string; alt?: string } | undefined)
              : typeof value === 'string'
                ? { src: value }
                : undefined
          return (
            <ImageField
              key={field.name}
              label={label}
              path={path}
              value={current}
              images={images}
              withAlt={widget === 'image'}
              layout={false}
              onChange={(next) => set(widget === 'image' ? (next.src ? next : undefined) : next.src)}
              onUploaded={onUploaded}
              onDeleted={onDeleted}
            />
          )
        }
        if (widget === 'list') {
          const items = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
          return (
            <Field
              key={field.name}
              label={label}
              path={path}
              value={items.join(', ')}
              hint="Separate the items with commas."
              onChange={(next) =>
                set(
                  next
                    .split(',')
                    .map((item) => item.trim())
                    .filter((item) => item !== ''),
                )
              }
            />
          )
        }
        if (widget === 'none') {
          return (
            <div class="bm-label" key={field.name}>
              {label}
              <code class="bm-mono">{value === undefined ? 'not set' : JSON.stringify(value)}</code>
              <span class="bm-hint">The editor has no control for this field. Change it in the file.</span>
            </div>
          )
        }
        return (
          <Field
            key={field.name}
            label={label}
            path={path}
            value={typeof value === 'string' ? value : ''}
            multiline={widget === 'longText'}
            hint={hint}
            meta={
              typeof schema.maxLength === 'number' ? `${typeof value === 'string' ? value.length : 0} / ${schema.maxLength}` : undefined
            }
            onChange={set}
          />
        )
      })}
    </div>
  )
}
