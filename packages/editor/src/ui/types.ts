import type { ThemeDefinition } from '../theme.js'
import type { CountRule } from '../draft.js'
import type { OptionalContent } from '../section-optional.js'
import type { FieldChoices, FieldIcons, ShowWhen } from '../field-rules.js'
import type { Wireframe } from '../wireframe.js'

export interface Option {
  name: string
  label: string
  type: 'enum' | 'boolean' | 'number' | 'string'
  choices?: readonly string[]
  default: string | boolean | number
  min?: number
  max?: number
}

export interface Catalog {
  sectionOptions: Record<string, readonly Option[]>
  siteOptions: readonly Option[]
  /** Caps from the site definition. Absent on an older API: the editor falls back to 2 and 3. */
  siteLimits?: { maxHeaderActions: number; maxFooterColumns: number }
  contentCounts: Record<string, Record<string, CountRule & { recommended?: number | string }>>
  sectionDefaults: Record<string, Record<string, unknown>>
  optionalContent?: Record<string, OptionalContent>
  /** Fixed choices per field key (`steps[].icon`), from each section schema's enums. */
  fieldChoices?: Record<string, FieldChoices>
  /** Picker icons per field key and choice, from each section's `icons`. */
  fieldIcons?: Record<string, FieldIcons>
  /** Image fields per section type, by field key (`poster`, `items[].image`), from each section schema. */
  fieldImages?: Record<string, readonly string[]>
  /** Props hidden while the section's options make them unused, from each section's `showWhen`. */
  showWhen?: Record<string, ShowWhen>
  /** The form handler each section type posts to (`contact` is `src/forms/contact.ts`), from each section's `form`. */
  sectionForms?: Record<string, string>
  sectionLabels: Record<string, string>
  /** One line per type for the Add section picker, from each section's definition. */
  sectionDescriptions?: Record<string, string>
  /** Picker thumbnail per type, from each section's `wireframe.ts`. */
  sectionWireframes?: Record<string, Wireframe>
  projectId?: string
  /** What the theme tells the editor. Absent on an older API: the editor uses the system defaults. */
  theme?: ThemeDefinition
}

export interface DraftOffer {
  savedAt: number
  page: unknown | null
  site: unknown | null
  conflict: boolean
}

export interface Issue {
  path: string
  message: string
  file?: 'page' | 'site'
}

export type Tab = 'pages' | 'section' | 'navigation' | 'footer' | 'design' | 'site'

export const TABS: readonly Tab[] = ['pages', 'section', 'navigation', 'footer', 'design', 'site']

export type SiteDraft = Record<string, unknown>

export type PageSummary = { slug: string; title: string; file: string; system?: boolean; anchors?: string[] }

export type LinkRecord = { label: string; href: string; newTab?: boolean; id?: string; trackingId?: string; style?: string }

export interface ConfirmAction {
  id: string
  action: 'duplicate' | 'delete'
}

export interface LinkEdit {
  top: number
  left: number
  path: string
  label: string
  href: string
  newTab: boolean
  id: string
  /** Button look chosen in the editor: primary, secondary, tertiary, or empty for the section's own design (Default). */
  style: string
  button: boolean
  removable: boolean
  richIndex?: number
  /** The collapsed Advanced row (Style and ID). Opens by itself when either is already set. */
  advanced: boolean
}

export interface HeadingBar {
  top: number
  left: number
  path: string
  start: number
  end: number
}

export interface SaveAction {
  id: string
  label: string
  danger?: boolean
  disabled?: boolean
  /** Shown at the right of the item. */
  shortcut?: string
  /** Draws a divider above the item. */
  separated?: boolean
  onSelect: () => void
}

export type VersionEntry = { id: string; at: string }

export interface GitState {
  enabled: boolean
  repo: boolean
  branch?: string
  files: { path: string; status: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked' }[]
}
