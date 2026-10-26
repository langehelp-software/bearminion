import fs from 'node:fs'
import path from 'node:path'

/** A Contact section on a site with no handler for it: `src/forms/contact.ts` does not exist. */
export interface UnhandledForm {
  /** The page's slug. */
  page: string
  /** The section's id. */
  section: string
}

interface CheckedPage {
  slug: string
  sections: ReadonlyArray<{ id: string; type: string }>
}

/** The name of the file the Contact form posts to: `/api/contact` is answered by `src/forms/contact.ts`. */
export const CONTACT_HANDLER = 'contact'

/** True when `<dir>/<name>.ts` (or `.mts`, `.js`, `.mjs`) exists. */
export function hasFormHandler(dir: string, name: string = CONTACT_HANDLER): boolean {
  return ['.ts', '.mts', '.js', '.mjs'].some((extension) => fs.existsSync(path.join(dir, `${name}${extension}`)))
}

/**
 * Every Contact section, on every page, while there is no handler. `astro dev` and `astro build` warn about these;
 * neither ever fails on them, so a new site still starts and builds.
 */
export function unhandledForms(pages: readonly CheckedPage[], handled: boolean): UnhandledForm[] {
  if (handled) return []
  return pages.flatMap((page) =>
    page.sections.filter((section) => section.type === 'contact').map((section) => ({ page: page.slug, section: section.id })),
  )
}

export function unhandledFormMessage(form: UnhandledForm): string {
  return `The contact form "${form.section}" on page "${form.page}" posts to /api/${CONTACT_HANDLER}, but src/forms/${CONTACT_HANDLER}.ts does not exist. Visitors who send it get an error. Create the file: https://docs.bearminion.com/forms`
}
