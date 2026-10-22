import { z } from 'zod'
import { textSchema } from './fields.js'
import { addLinkIdIssues } from './link-ids.js'
import type { SectionRegistry } from './model.js'
import { createSectionSchema, createTolerantSectionSchema, isOrphanSection, type BaseSection, type SectionOf } from './section-schema.js'

/** Section ids and optional anchors must be unique on a page. Link ids must not reuse an anchor. */
export function addSectionIdentityIssues(sections: readonly unknown[], ctx: z.RefinementCtx): void {
  const ids = new Set<string>()
  const anchors = new Set<string>()
  sections.forEach((section, index) => {
    if (typeof section !== 'object' || section === null) return
    const id = 'id' in section && typeof section.id === 'string' ? section.id : undefined
    const anchor = 'anchor' in section && typeof section.anchor === 'string' ? section.anchor : undefined
    if (id !== undefined) {
      if (ids.has(id)) {
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate section id "${id}"`,
          path: [index, 'id'],
        })
      }
      ids.add(id)
    }
    if (anchor !== undefined) {
      if (anchors.has(anchor)) {
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate anchor "${anchor}"`,
          path: [index, 'anchor'],
        })
      }
      anchors.add(anchor)
    }
  })
  addLinkIdIssues(sections, ctx)
}

/** Custom structured data. At most 10 blocks and 50 KB, so a stray paste cannot bloat every page. */
export const jsonLdSchema = z
  .array(z.record(z.string(), z.unknown()))
  .max(10)
  .refine((blocks) => JSON.stringify(blocks).length <= 50_000, 'JSON-LD is limited to 50 KB')

export const seoSchema = z
  .object({
    title: textSchema,
    description: z.string(),
    ogImage: z.string().min(1).optional(),
    /** When true, the page is left out of the sitemap and emits `noindex`. */
    noindex: z.boolean().default(false),
    nofollow: z.boolean().default(false),
    /** Absolute URL or site-relative path. Overrides the generated canonical. */
    canonical: z.string().min(1).optional(),
    /** Replaces the generated `WebPage` JSON-LD when set. */
    jsonLd: jsonLdSchema.optional(),
  })
  .strict()

/**
 * Pages the site needs but the user does not create: the editor lists them apart, edits their content,
 * and refuses to create, delete, rename or promote them to the home page.
 */
export const SYSTEM_PAGES = ['404'] as const

export function isSystemPage(slug: string): boolean {
  return (SYSTEM_PAGES as readonly string[]).includes(slug)
}

export const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase kebab-case (the home page uses "index")')

const cache = new WeakMap<SectionRegistry, z.ZodType>()
const tolerantCache = new WeakMap<SectionRegistry, z.ZodType>()

/** Validates a page document: its own fields, and every section against the registry. Cached per registry. */
export function createPageSchema<TRegistry extends SectionRegistry>(registry: TRegistry): z.ZodType<Page<SectionOf<TRegistry>>> {
  const cached = cache.get(registry)
  if (cached) return cached as z.ZodType<Page<SectionOf<TRegistry>>>
  const schema = buildPageSchema(createSectionSchema(registry))
  cache.set(registry, schema)
  return schema as unknown as z.ZodType<Page<SectionOf<TRegistry>>>
}

/** The editor's page schema: sections of a type the registry no longer defines are kept, not rejected. */
export function createTolerantPageSchema(registry: SectionRegistry): z.ZodType<Page> {
  const cached = tolerantCache.get(registry)
  if (cached) return cached as z.ZodType<Page>
  const schema = buildPageSchema(createTolerantSectionSchema(registry))
  tolerantCache.set(registry, schema)
  return schema as unknown as z.ZodType<Page>
}

function buildPageSchema(section: z.ZodType) {
  return z
    .object({
      slug: slugSchema,
      title: textSchema,
      seo: seoSchema,
      sections: z.array(section).superRefine((sections, ctx) => {
        addSectionIdentityIssues(sections, ctx)
      }),
    })
    .strict()
}

export type Seo = z.infer<typeof seoSchema>

/** A page. Pass the registry's section union (`SectionOf<typeof registry>`) to type its sections. */
export interface Page<TSection extends BaseSection = BaseSection> {
  slug: string
  title: string
  seo: Seo
  sections: TSection[]
}

/**
 * The page without sections whose `type` the registry does not define. A tolerant page (see
 * `tolerateOrphans`) may hold them; a site renders the result so it never meets a section it cannot draw.
 */
export function withoutOrphanSections<TPage extends { sections: readonly unknown[] }>(page: TPage, registry: SectionRegistry): TPage {
  const sections = page.sections.filter((section) => !isOrphanSection(registry, section))
  return sections.length === page.sections.length ? page : { ...page, sections }
}
