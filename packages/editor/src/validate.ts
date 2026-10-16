import type { z } from 'zod'
import type { SectionRegistry } from './model.js'
import { createPageSchema, createTolerantPageSchema } from './page.js'
import type { SiteDefinition } from './site.js'

export interface FieldIssue {
  path: string
  message: string
  /** Set by the combined save route, where a path alone cannot say whether it is in the page or the site. */
  file?: 'page' | 'site'
}

export function fieldIssues(error: z.ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.map((part) => String(part)).join('.') : '(root)',
    message: issue.message,
  }))
}

export function validateSite(input: unknown, site: SiteDefinition) {
  return site.schema.safeParse(input)
}

/** Validate a page document: its own fields, and each section against the registry's schema for its type. */
export function validatePage(input: unknown, registry: SectionRegistry) {
  return createPageSchema(registry).safeParse(input)
}

/**
 * Validate a page for the editor: like {@link validatePage}, but a section of a type the registry no longer
 * defines is kept as it is. The site build still rejects such a page until the section is removed.
 */
export function validateEditorPage(input: unknown, registry: SectionRegistry) {
  return createTolerantPageSchema(registry).safeParse(input)
}
