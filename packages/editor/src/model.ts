import type { SectionDefinition } from './define-section.js'
import type { ContentVersioning } from './migrate.js'
import type { SiteDefinition } from './site.js'
import type { ThemeDefinition } from './theme.js'

/** Runtime-neutral pieces of the content model: no Node or Astro imports, so themes and the overlay can use them. */

export const API_PREFIX = '/__bearminion/api'
export const DEFAULT_CONTENT_DIR = 'content'
export const DEFAULT_UPLOADS_DIR = 'src/assets/uploads'
/** Videos are served as they are, so they live in `public/`. */
export const DEFAULT_VIDEOS_DIR = 'public/videos'

/** Section definitions by type. The site supplies it: each section lives in its own directory. */
export type SectionRegistry = Record<string, SectionDefinition>

/**
 * Everything a site supplies about its content: the section types and the site chrome.
 * Pass the same object to `bearminion()` and to `loadContent()`.
 */
export interface ContentModel extends ContentVersioning {
  /** The site's section definitions: schemas, options, defaults and wireframes. Validates page writes and feeds the editor. */
  sections: SectionRegistry
  /** Header and footer layouts, limits and controls, from `defineSite`. Validates site writes and feeds the editor. */
  site: SiteDefinition
  /** What the theme tells the editor (font slot labels and families). Default: {@link defaultTheme}. */
  theme?: ThemeDefinition
}
