import { z } from 'zod'
import { defineSection, linkSchema, richTextSchema, textSchema, withEmphasis, type CountRule } from 'bearminion'
import { accent, eyebrow, heading } from '../shared'
import { feedbackWireframe } from './wireframe'

/**
 * bearminion.com only: asks for ideas and feedback, and shows the public roadmap. It lives in apps/web/sections, not in
 * templates/default, so it is not in the registry and no other site gets it (apps/web/scripts/sync-template.mjs copies
 * it in next to the template's sections).
 */
export const feedbackVariants = ['split'] as const

export const feedbackIcons = ['chat', 'mail'] as const

export const feedbackCounts = {
  channels: { recommended: 2, min: 1, max: 3 },
  roadmap: { recommended: 3, min: 1, max: 5 },
} as const satisfies Record<string, CountRule>

export const channelSchema = z
  .object({
    title: textSchema,
    /** One line under the title: where it goes and what it is best for. */
    description: textSchema.optional(),
    href: z.string().min(1),
    /** `primary` is the dark card. Use it once. */
    variant: z.enum(['primary', 'secondary']),
    icon: z.enum(feedbackIcons),
  })
  .strict()

export const milestoneSchema = z
  .object({
    /** Short label above the title, such as "Up next" or "Then". */
    status: textSchema,
    title: textSchema,
    body: richTextSchema.optional(),
    /** Small tiles under the text, for the parts of a milestone. */
    parts: z
      .array(z.object({ title: textSchema, body: textSchema.optional() }).strict())
      .max(3)
      .optional(),
  })
  .strict()

export const feedbackSchema = withEmphasis({
  eyebrow,
  heading,
  body: richTextSchema.optional(),
  channels: z.array(channelSchema).min(feedbackCounts.channels.min).max(feedbackCounts.channels.max),
  /** The quiet text link under the cards, such as where to report a bug. */
  bugLink: linkSchema.optional(),
  /** The roadmap card's title. */
  roadmapTitle: textSchema.optional(),
  /** The label in the roadmap card's header, such as "after v0.x". */
  roadmapLabel: textSchema.optional(),
  /** First item is drawn as the active one; the last gets a dashed line to show it is further out. */
  roadmap: z.array(milestoneSchema).min(feedbackCounts.roadmap.min).max(feedbackCounts.roadmap.max),
  /** The open step at the end of the roadmap: its small label, such as "Your idea", and the link. */
  pitchStatus: textSchema.optional(),
  pitch: linkSchema.optional(),
})

export type FeedbackProps = z.infer<typeof feedbackSchema>

const HEADING = 'Tell the minion what to build next.'

export const feedback = defineSection({
  type: 'feedback',
  label: 'Feedback & roadmap',
  description: 'Ways to send ideas and feedback, next to the public roadmap.',
  schema: feedbackSchema,
  defaults: {
    eyebrow: 'Feedback & ideas',
    heading: HEADING,
    marks: accent(HEADING, 'what to build next.'),
    body: "Here's where we're heading. If something you need isn't on the list, or you'd order it differently, tell us.",
    channels: [
      { title: 'Start a discussion', description: 'Public, best for feature ideas.', href: '#', variant: 'primary', icon: 'chat' },
      { title: 'Write to us privately', description: 'For anything you would rather not post.', href: '#contact', variant: 'secondary', icon: 'mail' },
    ],
    bugLink: { label: 'Found a bug? Open an issue instead', href: '#' },
    roadmapTitle: 'Roadmap',
    roadmapLabel: 'Coming up',
    roadmap: [
      { status: 'Up next', title: 'The next big thing', body: 'Say what it lets people do.' },
      { status: 'Then', title: 'After that', body: 'One or two lines, starting with the benefit.' },
    ],
    pitchStatus: 'Your idea',
    pitch: { label: 'Pitch your idea', href: '#' },
  },
  variants: feedbackVariants,
  defaultVariant: 'split',
  optional: {
    props: ['eyebrow', 'heading', 'body', 'bugLink', 'roadmapTitle', 'roadmapLabel', 'pitchStatus', 'pitch'],
    items: { channels: ['description'], roadmap: ['body', 'parts'] },
  },
  counts: feedbackCounts,
  wireframe: feedbackWireframe,
})
