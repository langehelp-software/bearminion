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

/**
 * With `BEARMINION_FORMS=required` the build stops instead of warning, so a production deploy cannot go out with a Contact
 * form nobody answers. Set it in the host's build environment, not in `.env`: a new site and `astro dev` stay as they are.
 * The section is never hidden, because a page that loses a section without a word is worse than a build that says why.
 */
export function formsRequired(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'required'
}

export function requiredFormsError(forms: readonly UnhandledForm[]): Error | undefined {
  if (forms.length === 0) return undefined
  return new Error(
    `${forms.map(unhandledFormMessage).join('\n')}\nBEARMINION_FORMS=required stops the build while a contact form has no handler.`,
  )
}
