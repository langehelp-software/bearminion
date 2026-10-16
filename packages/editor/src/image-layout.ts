/** How an image sits in its frame. Pure data so the editor UI and the schema share one list. */

export const IMAGE_FITS = ['cover', 'contain', 'auto'] as const
export type ImageFit = (typeof IMAGE_FITS)[number]

/** Rows then columns, so the list reads like the 3x3 grid in the editor. */
export const IMAGE_POSITIONS = ['top left', 'top', 'top right', 'left', 'center', 'right', 'bottom left', 'bottom', 'bottom right'] as const
export type ImagePosition = (typeof IMAGE_POSITIONS)[number]

export const DEFAULT_IMAGE_FIT: ImageFit = 'cover'
export const DEFAULT_IMAGE_POSITION: ImagePosition = 'center'

export function isImageFit(value: unknown): value is ImageFit {
  return typeof value === 'string' && (IMAGE_FITS as readonly string[]).includes(value)
}

export function isImagePosition(value: unknown): value is ImagePosition {
  return typeof value === 'string' && (IMAGE_POSITIONS as readonly string[]).includes(value)
}

/**
 * Apply a fit or position change to an image object. Keys that equal their default
 * are removed, so saved JSON only holds real choices. Other keys are kept as they are.
 */
export function withImageLayout<T extends object>(image: T, patch: { fit?: ImageFit; position?: ImagePosition }): T {
  const next: Record<string, unknown> = { ...image, ...patch }
  if (next.fit === DEFAULT_IMAGE_FIT || next.fit === undefined) delete next.fit
  if (next.position === DEFAULT_IMAGE_POSITION || next.position === undefined) delete next.position
  return next as T
}
