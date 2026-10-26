import { z } from 'zod'
import { defineSection, imageSchema, richTextSchema, textSchema, withEmphasis } from 'bearminion'
import { accent, eyebrow, heading } from '../shared'
import { galleryWireframe } from './wireframe'

export const galleryVariants = ['grid', 'masonry', 'featured'] as const
export const galleryColumns = ['2', '3', '4'] as const

export const galleryCounts = { images: { recommended: '6 to 12', min: 1, max: 24 } } as const

/**
 * A gallery picture needs a description: it is the only thing a screen reader or a failed load shows. The optional
 * `caption` is for everyone else: it shows under the picture in the lightbox.
 */
export const galleryImageSchema = imageSchema.extend({
  alt: z.string().min(1, 'Describe the picture'),
  caption: textSchema.optional(),
})

export const gallerySchema = withEmphasis({
  eyebrow,
  heading,
  body: richTextSchema.optional(),
  images: z.array(galleryImageSchema).min(galleryCounts.images.min).max(galleryCounts.images.max),
  /** Pictures per row on a wide screen. Fewer on narrow ones. */
  columns: z.enum(galleryColumns).default('3'),
  /** Off: pictures stay where they are. On: a click opens the picture large, with arrows to move through the rest. */
  lightbox: z.boolean().default(true),
  /** On: each picture sits in a bordered box, so a picture that does not fill its frame still shows where the frame ends. */
  frame: z.boolean().default(false),
})

export type GalleryProps = z.infer<typeof gallerySchema>

export const gallery = defineSection({
  type: 'gallery',
  label: 'Gallery',
  description: 'A set of pictures. Click one to see it large, with captions, arrows and swipe.',
  schema: gallerySchema,
  defaults: {
    eyebrow: 'Gallery',
    heading: 'A few pictures say it faster.',
    marks: accent('A few pictures say it faster.', 'faster.'),
    images: [1, 2, 3, 4, 5, 6].map((n) => ({ src: 'placeholder', alt: `Picture ${n}` })),
    columns: '3',
    lightbox: true,
    frame: false,
  },
  variants: galleryVariants,
  defaultVariant: 'grid',
  options: [
    { name: 'columns', label: 'Pictures per row', type: 'enum', choices: galleryColumns, default: '3' },
    { name: 'lightbox', label: 'Open pictures large on click', type: 'boolean', default: true },
    { name: 'frame', label: 'Draw a box around each picture', type: 'boolean', default: false },
  ],
  optional: { props: ['eyebrow', 'heading', 'body'], items: { images: ['caption'] } },
  counts: galleryCounts,
  wireframe: galleryWireframe,
})
