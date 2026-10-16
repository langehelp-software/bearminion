import {
  createPageSchema,
  createSectionSchema,
  type Option,
  type Page as ContentPage,
  type SectionOf,
  type SectionRegistry,
} from 'bearminion'
import { contact } from './contact/definition'
import { cta } from './cta/definition'
import { faq } from './faq/definition'
import { features } from './features/definition'
import { hero } from './hero/definition'
import { logoStrip } from './logo-strip/definition'
import { pricing } from './pricing/definition'
import { stats } from './stats/definition'
import { testimonials } from './testimonials/definition'
import { textImage } from './text-image/definition'

/**
 * Every section type of this site. Each one is defined in its own directory:
 * `definition.ts` (zod schema, defaults, options), `wireframe.ts` (the Add section thumbnail),
 * and the Astro component. Add a directory and list it here (and in `registry.ts`) to add a type.
 *
 * It holds no `.astro` imports, so `astro.config.ts` and the editor can load it.
 */
export const sectionDefinitions = {
  hero,
  logoStrip,
  features,
  textImage,
  stats,
  testimonials,
  pricing,
  faq,
  cta,
  contact,
} satisfies SectionRegistry

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
