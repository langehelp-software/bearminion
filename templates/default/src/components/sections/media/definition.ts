import { z } from 'zod'
import { defineSection, imageSchema, richTextSchema, textSchema, withEmphasis } from 'bearminion'
import { accent, eyebrow, heading } from '../shared'
import { parseMediaSource } from './source'
import { mediaWireframe } from './wireframe'

export const mediaVariants = ['centered', 'wide', 'split'] as const
export const mediaKinds = ['video', 'image'] as const
/** `controls`: the visitor presses play. `loop`: a video file plays silently on repeat while it is on screen, like a moving image. */
export const mediaPlayback = ['controls', 'loop'] as const
export const mediaAspects = ['16:9', '4:3', '21:9', '1:1'] as const

/** A YouTube or Vimeo link, a path in `public/` such as `/videos/demo.webm`, or an `https://` link to a video file. */
export const mediaVideoSchema = z
  .string()
  .min(1)
  .refine((value) => parseMediaSource(value) !== null, {
    message: 'Use a YouTube or Vimeo link, a link to a video file ending in .mp4 or .webm, or a path in public/ such as /videos/demo.webm.',
  })

export const mediaSchema = withEmphasis({
  eyebrow,
  heading,
  body: richTextSchema.optional(),
  /** `video` plays the link in `video`; `image` shows `image`. */
  kind: z.enum(mediaKinds).default('video'),
  aspect: z.enum(mediaAspects).default('16:9'),
  /** Off: no eyebrow, heading or body, and in the centered layout a wider frame with no top padding. */
  intro: z.boolean().default(true),
  video: mediaVideoSchema.optional(),
  /** Shown before the video plays. Without one, a YouTube video shows its own thumbnail. */
  poster: imageSchema.optional(),
  image: imageSchema.optional(),
  /** What the video shows, read out by screen readers. An image uses its own alt text. */
  label: textSchema.optional(),
  caption: textSchema.optional(),
  playback: z.enum(mediaPlayback).default('controls'),
})

export type MediaProps = z.infer<typeof mediaSchema>

export const media = defineSection({
  type: 'media',
  label: 'Media',
  description: 'One video or image under a heading. YouTube, Vimeo or a video file, with a poster and a caption.',
  schema: mediaSchema,
  defaults: {
    eyebrow: 'Demo',
    heading: 'See it in action.',
    marks: accent('See it in action.', 'in action.'),
    body: 'Paste a YouTube or Vimeo link, or a link to a video file. Nothing loads until the visitor presses play.',
    kind: 'video',
    aspect: '16:9',
    intro: true,
    label: 'Product walkthrough',
    playback: 'controls',
  },
  variants: mediaVariants,
  defaultVariant: 'centered',
  options: [
    { name: 'kind', label: 'Type', type: 'enum', choices: mediaKinds, default: 'video' },
    { name: 'aspect', label: 'Shape', type: 'enum', choices: mediaAspects, default: '16:9' },
    { name: 'playback', label: 'Video playback', type: 'enum', choices: mediaPlayback, default: 'controls' },
    { name: 'intro', label: 'Show heading', type: 'boolean', default: true },
  ],
  optional: { props: ['eyebrow', 'heading', 'body', 'video', 'poster', 'image', 'label', 'caption'] },
  showWhen: {
    eyebrow: { intro: true },
    heading: { intro: true },
    body: { intro: true },
    video: { kind: 'video' },
    poster: { kind: 'video' },
    label: { kind: 'video' },
    image: { kind: 'image' },
  },
  wireframe: mediaWireframe,
})
