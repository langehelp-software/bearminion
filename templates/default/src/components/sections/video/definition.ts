import { z } from 'zod'
import { defineSection, imageSchema, richTextSchema, textSchema, withEmphasis } from 'bearminion'
import { VIDEO_FILE } from '../media/source'
import { accent, eyebrow, heading } from '../shared'
import { videoWireframe } from './wireframe'

export const videoVariants = ['framed', 'wide', 'split'] as const

/** `controls`: the visitor presses play. `loop`: plays silently and on repeat while it is on screen, like a moving image. */
export const videoPlayback = ['controls', 'loop'] as const

/**
 * A video file the browser can play: a path in the site's `public/` folder (`/videos/demo.webm`) or an `https://` link
 * to the file. `placeholder` shows an empty frame. A page link such as YouTube does not play in a video element.
 */
export const videoSourceSchema = z
  .string()
  .min(1)
  .refine((value) => value === 'placeholder' || VIDEO_FILE.test(value), {
    message:
      'Use a link to a video file ending in .mp4 or .webm, or a path in public/ such as /videos/demo.webm. YouTube and similar page links do not play here.',
  })

export const videoSchema = withEmphasis({
  eyebrow,
  heading,
  intro: richTextSchema.optional(),
  video: videoSourceSchema,
  /** What the video shows, read out by screen readers. */
  label: textSchema.optional(),
  /** Shown before the video plays and while it loads. */
  poster: imageSchema.optional(),
  caption: textSchema.optional(),
  playback: z.enum(videoPlayback).default('controls'),
})

export type VideoProps = z.infer<typeof videoSchema>

export const video = defineSection({
  type: 'video',
  label: 'Video',
  description: 'A video with a heading, a poster image and a caption.',
  schema: videoSchema,
  defaults: {
    eyebrow: 'Watch',
    heading: 'See it in action.',
    marks: accent('See it in action.', 'in action.'),
    intro: 'A short video says more than a page of text. Link an .mp4 or .webm file and add a poster image to show before it plays.',
    video: 'placeholder',
    label: 'Product walkthrough',
    playback: 'controls',
  },
  variants: videoVariants,
  defaultVariant: 'framed',
  options: [{ name: 'playback', label: 'Playback', type: 'enum', choices: videoPlayback, default: 'controls' }],
  optional: { props: ['eyebrow', 'heading', 'intro', 'label', 'poster', 'caption'] },
  wireframe: videoWireframe,
})
