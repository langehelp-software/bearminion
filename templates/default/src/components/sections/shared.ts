import { marksFromEmphasis, textSchema } from 'bearminion'

/** Optional text every section can drop. */
export const eyebrow = textSchema.optional()
export const heading = textSchema.optional()

/** Marks that style `em` inside `heading`, for the default copy. */
export function accent(heading: string, em: string) {
  return marksFromEmphasis(heading, em)
}

/** Default in-page target for contact CTAs. Sample pages set this anchor on the contact section. */
export const DEFAULT_CONTACT_ANCHOR = 'contact'
