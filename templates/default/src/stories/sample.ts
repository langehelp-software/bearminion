import type { Site } from '../components/organisms/site-definition'
import type { Section } from '../components/sections/definitions'
import home from '../../content/pages/index.json'
import siteJson from '../../content/site.json'

/** Site chrome from `content/site.json`, shared by organism stories. */
export const site = siteJson as Site

const sections = home.sections as Section[]

/** A section from the home page JSON, plus its index in that page. */
export function sectionEntry<T extends Section['type']>(
  type: T,
): {
  section: Extract<Section, { type: T }>
  index: number
} {
  const index = sections.findIndex((item) => item.type === type)
  const section = sections[index]
  if (!section || section.type !== type) {
    throw new Error(`Sample content is missing a ${type} section.`)
  }
  return { section: section as Extract<Section, { type: T }>, index }
}
