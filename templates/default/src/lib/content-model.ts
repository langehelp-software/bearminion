import { defineTheme } from 'bearminion'
import { siteDefinition } from '../components/organisms/site-definition'
import { sectionDefinitions } from '../components/sections/definitions'
import { migrateVideoToMedia } from './migrations'

/**
 * Everything the editor and the loaders need to know about this site's content: its section types
 * and its header and footer. Passed to `bearminion()` and `loadContent()` in `astro.config.ts`.
 */
export const contentModel = {
  sections: sectionDefinitions,
  site: siteDefinition,
  /** What the editor shows for this theme's font slots. The fonts themselves load in `styles/global.css`. */
  theme: defineTheme({
    fonts: {
      sans: { label: 'Sans', family: '"Bricolage Grotesque Variable", ui-sans-serif, system-ui, sans-serif' },
      serif: { label: 'Serif', family: '"Instrument Serif", Georgia, serif' },
      mono: { label: 'Mono', family: '"JetBrains Mono", ui-monospace, monospace' },
    },
  }),
  /**
   * Raise this when a schema change would reject files written before it, and add `migrations[n]`
   * to upgrade version n to n + 1. Files without a `schemaVersion` count as version 1.
   * Version 2 folded the Video section into Media.
   */
  schemaVersion: 2,
  migrations: { 1: migrateVideoToMedia },
}
