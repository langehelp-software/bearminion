/**
 * The starter site's section definitions, for tests that need real sections.
 * The library ships none of its own: each section lives in a directory of the starter,
 * with its schema, defaults, options and wireframe.
 */
import {
  sectionDefinitions,
  sectionOptions,
  sectionSchema,
  sectionTypes,
  pageSchema,
  type Section,
} from '../../../templates/default/src/components/sections/definitions'
import { siteDefinition } from '../../../templates/default/src/components/organisms/site-definition'
import { faqCounts } from '../../../templates/default/src/components/sections/faq/definition'
import { featuresCounts } from '../../../templates/default/src/components/sections/features/definition'
import { heroSchema } from '../../../templates/default/src/components/sections/hero/definition'
import { stepsCounts } from '../../../templates/default/src/components/sections/steps/definition'

export { heroSchema, pageSchema, sectionOptions, sectionSchema, sectionTypes, type Section }
export const sectionRegistry = sectionDefinitions
export { siteDefinition }

/** The starter's full content model, as passed to `bearminion()` and `loadContent()`. */
export const contentModel = { sections: sectionDefinitions, site: siteDefinition }

/** Site schema and controls of the starter's header and footer. */
export const siteSchema = siteDefinition.schema
export const siteOptions = siteDefinition.options

/** Item-count rules the starter's schemas enforce. */
export const contentCounts = { features: featuresCounts, faq: faqCounts, steps: stepsCounts } as const

export const optionalContent = Object.fromEntries(sectionTypes.map((type) => [type, sectionDefinitions[type].optional]))
