import { useState } from 'preact/hooks'
import { pageHref, suggestPageSlug } from '../../draft.js'
import { createEntry } from '../api-client.js'
import type { PageSummary } from '../types.js'
import { Field } from './fields.js'

/** The address a listed document is opened at. */
export const documentHref = (item: PageSummary): string => item.path ?? pageHref(item.slug)

/**
 * Title, slug and the section a new document starts from. The slug follows the title until it is typed by hand, and
 * the title never changes it afterwards.
 */
export function NewDocumentForm({
  type = 'pages',
  path,
  noun = 'page',
  taken,
  labels,
  onNavigate,
}: {
  type?: string
  path?: string
  noun?: 'page' | 'entry'
  /** Slugs already used in the type's folder. */
  taken: ReadonlySet<string>
  labels: Record<string, string>
  onNavigate: (href: string) => void
}) {
  const start = noun === 'page' ? 'Notes' : 'Untitled'
  const [title, setTitle] = useState(start)
  const [slug, setSlug] = useState(() => suggestPageSlug(start, taken))
  /** True once the slug was typed by hand: from then on the title no longer changes it. */
  const [slugTyped, setSlugTyped] = useState(false)
  const [error, setError] = useState('')
  const templates = Object.entries(labels)
  const [template, setTemplate] = useState(() => (labels.hero !== undefined ? 'hero' : (templates[0]?.[0] ?? '')))
  return (
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
        hint={`The ${noun} address. Made from the title until you change it, and the title never changes it afterwards.`}
        onChange={(value) => {
          setSlug(value)
          setSlugTyped(true)
        }}
      />
      <label class="bm-label">
        Template
        <select value={template} onChange={(event) => setTemplate(event.currentTarget.value)}>
          {templates.map(([sectionType, label]) => (
            <option key={sectionType} value={sectionType}>
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
          void createEntry(type, { slug, title, ...(template === '' ? {} : { template }) }).then((result) => {
            if (result.ok) onNavigate(path === undefined ? pageHref(slug) : path.replace('{slug}', slug))
            else setError(result.status === 0 ? `Could not create the ${noun}.` : result.message)
          })
        }}
      >
        Create {noun}
      </button>
      {error && <p class="bm-error">{error}</p>}
    </div>
  )
}
