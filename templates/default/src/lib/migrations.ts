import type { ContentMigration } from 'bearminion'

type Record_ = Record<string, unknown>
const isRecord = (value: unknown): value is Record_ => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The old Video section's layouts, as the Media section names them. */
const VARIANT: Record<string, string> = { framed: 'centered', wide: 'wide', split: 'split' }

/** A Video section is a Media section of kind `video`: its `intro` is the Media `body`, and an empty placeholder frame is no link. */
export function videoToMedia(section: Record_): Record_ {
  const { intro, video, playback, ...rest } = isRecord(section.props) ? section.props : ({} as Record_)
  const props: Record_ = { ...rest, kind: 'video' }
  if (intro !== undefined) props.body = intro
  if (typeof video === 'string' && video !== 'placeholder') props.video = video
  if (playback === 'loop') props.playback = 'loop'
  const variant = typeof section.variant === 'string' ? (VARIANT[section.variant] ?? 'centered') : 'centered'
  return { ...section, type: 'media', variant, props }
}

/** Version 1 to 2: the Video section is folded into Media. */
export const migrateVideoToMedia: ContentMigration = (document, kind) => {
  if (kind !== 'page' || !Array.isArray(document.sections)) return document
  return {
    ...document,
    sections: document.sections.map((section) => (isRecord(section) && section.type === 'video' ? videoToMedia(section) : section)),
  }
}
