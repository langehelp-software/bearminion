import { z } from 'zod'
import { fontMarks, markHasStyle, marksFromEmphasis, marksOverlap, weightMarks, type TextMark } from './marks.js'
import { buttonStyles, tones } from './section-options.js'
import { IMAGE_FITS, IMAGE_POSITIONS } from './image-layout.js'

/** Non-empty plain text. */
export const textSchema = z.string().min(1)

/** Non-empty rich text stored as markdown (bold, italic, links, paragraphs). */
export const richTextSchema = z.string().min(1)

/**
 * Header and footer links may nest this many levels.
 * The top-level link is depth 1, so 3 means a link, a child, and a grandchild.
 */
export const MAX_NAV_DEPTH = 3

/**
 * `fit` and `position` are omitted at their defaults (cover, center), so existing
 * content stays valid and unchanged. `auto` drops the frame's aspect ratio and lets
 * the image keep its own.
 */
export const imageSchema = z
  .object({
    src: z.string().min(1),
    alt: z.string(),
    fit: z.enum(IMAGE_FITS).optional(),
    position: z.enum(IMAGE_POSITIONS).optional(),
    /** Section images: true hides the image and its frame on the page. The file and alt text stay. */
    hidden: z.boolean().optional(),
  })
  .strict()

/** HTML id for a button or link. Same slug shape as a section anchor. */
export const htmlIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'ID must be a lowercase slug')

/** Optional analytics token rendered as `data-analytics`. */
export const trackingIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/, 'Tracking id must be a short token')

export const textMarkSchema = z
  .object({
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
    weight: z.enum(weightMarks).optional(),
    italic: z.boolean().optional(),
    font: z.enum(fontMarks).optional(),
  })
  .strict()
  .superRefine((mark, ctx) => {
    if (!markHasStyle(mark)) {
      ctx.addIssue({ code: 'custom', message: 'a text mark needs a weight, italic, or font' })
    }
    if (mark.end <= mark.start) {
      ctx.addIssue({ code: 'custom', message: 'a text mark end must be after its start' })
    }
  })

export interface Link {
  label: string
  href: string
  newTab?: boolean
  id?: string
  trackingId?: string
  style?: ButtonStyle
  children?: Link[]
}

const linkFields = {
  label: textSchema,
  href: z.string().min(1),
  newTab: z.boolean().optional(),
  id: htmlIdSchema.optional(),
  trackingId: trackingIdSchema.optional(),
  /** Section buttons only: primary, secondary or tertiary. Unset keeps the section's own design. */
  style: z.enum(buttonStyles).optional(),
}

function navLinkSchema(depth: number): z.ZodType<Link> {
  if (depth >= MAX_NAV_DEPTH) {
    return z.object(linkFields).strict()
  }
  return z.lazy(() =>
    z
      .object({
        ...linkFields,
        children: z.array(navLinkSchema(depth + 1)).optional(),
      })
      .strict(),
  )
}

/** A nav link. `children` is optional. */
export const linkSchema: z.ZodType<Link> = navLinkSchema(1)

export const toneSchema = z.enum(tones).default('base')

export type Text = z.infer<typeof textSchema>
export type RichText = z.infer<typeof richTextSchema>
export type Image = z.infer<typeof imageSchema>
export type Tone = z.infer<typeof toneSchema>
export type ButtonStyle = (typeof buttonStyles)[number]
export type { TextMark }

/**
 * Headings stay plain text. `marks` styles ranges inside `heading`.
 * Legacy `em` (a substring drawn in the serif italic accent) migrates to one mark.
 */
export function withEmphasis<T extends z.ZodRawShape>(shape: T) {
  return z
    .object({
      ...shape,
      em: z.string().min(1).optional(),
      marks: z.array(textMarkSchema).optional(),
    })
    .strict()
    .superRefine((value, ctx) => {
      const heading = 'heading' in value && typeof value.heading === 'string' ? value.heading : ''
      const em = 'em' in value && typeof value.em === 'string' ? value.em : undefined
      if (em !== undefined && heading !== '' && !heading.includes(em)) {
        ctx.addIssue({
          code: 'custom',
          message: 'em must be a substring of heading',
          path: ['em'],
        })
      }
      const marks = 'marks' in value && Array.isArray(value.marks) ? (value.marks as TextMark[]) : undefined
      // Without a heading there is nothing to style. The transform drops the marks.
      if (heading !== '') addMarkIssues(heading, marks, ctx)
    })
    .transform((value): Omit<typeof value, 'em'> & { marks?: TextMark[] } => {
      const source = value as typeof value & { heading?: string; em?: string; marks?: TextMark[] }
      const heading = typeof source.heading === 'string' ? source.heading : ''
      const explicit = Array.isArray(source.marks) ? source.marks : undefined
      const resolved = heading === '' ? undefined : (explicit ?? marksFromEmphasis(heading, source.em))
      const copy = { ...(source as Record<string, unknown>) }
      delete copy.em
      return {
        ...copy,
        marks: resolved && resolved.length > 0 ? resolved : undefined,
      } as Omit<typeof value, 'em'> & { marks?: TextMark[] }
    })
}

export function addMarkIssues(
  text: string,
  marks: readonly TextMark[] | undefined,
  ctx: z.RefinementCtx,
  path: (string | number)[] = ['marks'],
): void {
  if (!marks) return
  marks.forEach((mark, index) => {
    if (mark.end > text.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'a text mark must stay inside the text',
        path: [...path, index, 'end'],
      })
    }
  })
  if (marksOverlap(marks)) {
    ctx.addIssue({
      code: 'custom',
      message: 'text marks must not overlap',
      path,
    })
  }
}
