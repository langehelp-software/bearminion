import { createPageSchema, createSectionSchema, type Option, type Page as ContentPage, type SectionOf } from 'bearminion'
import { sectionDefinitions as generated } from './definitions.gen'

/**
 * Where a section type sits in the editor's Add section menu and on the variants page. A type that is not listed
 * (one you added) comes after these, by name.
 */
const order = [
  'hero',
  'logoStrip',
  'steps',
  'gallery',
  'features',
  'text',
  'textImage',
  'stats',
  'testimonials',
  'pricing',
  'media',
  'faq',
  'cta',
  'contact',
] as const

const rank = (type: string) => {
  const index = (order as readonly string[]).indexOf(type)
  return index === -1 ? order.length : index
}

/**
 * Every section type of this site. A type is a directory next to this file with a `definition.ts` (zod schema,
 * defaults, options), a `wireframe.ts` (the Add section thumbnail) and the Astro component. `bearminion sync` lists
 * the directories in `definitions.gen.ts` and `components.gen.ts`: add a directory, run it, and the type exists.
 *
 * It holds no `.astro` imports, so `astro.config.ts` and the editor can load it.
 */
export const sectionDefinitions = Object.fromEntries(
  Object.entries(generated).sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b)),
) as typeof generated

export type SectionType = keyof typeof sectionDefinitions
export type Section = SectionOf<typeof sectionDefinitions>
export type Page = ContentPage<Section>

export const sectionTypes = Object.keys(sectionDefinitions) as SectionType[]

/** Validates one section: the `type` picks its schema, which checks `variant` and `props`. */
export const sectionSchema = createSectionSchema(sectionDefinitions)
export const pageSchema = createPageSchema(sectionDefinitions)

/** Variant, tone, motion and any other control of each section type. */
export const sectionOptions = Object.fromEntries(sectionTypes.map((type) => [type, sectionDefinitions[type].options])) as Record<
  SectionType,
  readonly Option[]
>
