import { getAt, type NavLink } from '../../draft.js'
import { type LinkPage, FooterColumns } from '../nav.js'
import { text } from '../shared.js'
import type { SiteDraft, Option } from '../types.js'
import { Field } from './fields.js'
import { siteOptionControl } from './site-form.js'

/** Footer tab: layout, text, and the columns with their links. */
export function FooterForm({
  site,
  options,
  maxColumns,
  pages,
  currentSlug,
  currentAnchors,
  onField,
  onOptional,
}: {
  site: SiteDraft
  options: readonly Option[]
  maxColumns: number
  pages: readonly LinkPage[]
  currentSlug: string
  currentAnchors: readonly string[]
  onField: (path: string, value: unknown) => void
  onOptional: (path: string, value: string) => void
}) {
  const layout = options.filter((option) => option.name.startsWith('footer.') && option.name !== 'footer.badge')
  return (
    <div class="bm-stack">
      <div class="bm-stack">
        <p class="bm-group">Layout</p>
        <div class="bm-row-split">{layout.map((option) => siteOptionControl(site, option, onField))}</div>
      </div>
      <div class="bm-stack">
        <p class="bm-group">Content</p>
        <Field
          label="Text"
          path="footer.text"
          value={text(getAt(site, 'footer.text'))}
          onChange={(value) => onOptional('footer.text', value)}
          multiline
        />
        <Field
          label="Legal line"
          path="footer.legal"
          value={text(getAt(site, 'footer.legal'))}
          onChange={(value) => onOptional('footer.legal', value)}
        />
        {options.some((option) => option.name === 'footer.badge') && (
          <Field
            label="Badge"
            path="footer.badge"
            value={text(getAt(site, 'footer.badge'))}
            onChange={(value) => onOptional('footer.badge', value)}
            hint="Pill on the footer. Empty hides it."
          />
        )}
      </div>
      <FooterColumns
        columns={footerColumns(site)}
        maxColumns={maxColumns}
        onColumns={(next) => onField('footer.columns', next)}
        pages={pages}
        currentSlug={currentSlug}
        currentAnchors={currentAnchors}
      />
    </div>
  )
}

function footerColumns(site: SiteDraft): { title: string; links: NavLink[] }[] {
  const footer = site.footer
  if (typeof footer !== 'object' || footer === null || !('columns' in footer)) return []
  const columns = (footer as { columns?: unknown }).columns
  if (!Array.isArray(columns)) return []
  return columns.flatMap((column) => {
    if (typeof column !== 'object' || column === null) return []
    const title = 'title' in column && typeof column.title === 'string' ? column.title : ''
    const links = 'links' in column && Array.isArray(column.links) ? (column.links as NavLink[]) : []
    return [{ title, links }]
  })
}
