/**
 * Picker wireframes. A section directory ships a `wireframe.ts` that describes one greyscale
 * thumbnail as a list of rectangles, so the Add section picker needs no knowledge of the section.
 * Plain data (not a component) because the picker runs in the browser and cannot render `.astro`.
 */

/**
 * What a rectangle stands for. The editor maps each kind to a fixed greyscale fill, so a theme
 * colour never reaches the thumbnail.
 *
 * - `title`      dark bar, a heading
 * - `text`       light bar, a line of body text or a label
 * - `block`      pale panel, an image or a media frame
 * - `button`     dark pill, a filled button
 * - `outline`    outlined pill, a secondary button
 * - `card`       white card with a hairline ring
 * - `highlight`  white card with a strong ring, the featured card
 * - `avatar`     round grey dot
 * - `dark`       dark panel behind inverse content
 * - `light`      white bar on a dark panel
 * - `figure`     mid-grey block on a dark panel, a big number
 */
export const wireKinds = ['title', 'text', 'block', 'button', 'outline', 'card', 'highlight', 'avatar', 'dark', 'light', 'figure'] as const

export type WireKind = (typeof wireKinds)[number]

/** `[left %, top %, width %, height %, kind]` inside a 100 × 100 frame. Later rectangles paint over earlier ones. */
export type WireRect = readonly [left: number, top: number, width: number, height: number, kind: WireKind]

export type Wireframe = readonly WireRect[]

/** Returns the problems with a wireframe; empty when it is usable. */
export function wireframeIssues(wireframe: Wireframe): string[] {
  const issues: string[] = []
  if (wireframe.length === 0) issues.push('A wireframe needs at least one rectangle.')
  wireframe.forEach((rect, index) => {
    const [left, top, width, height, kind] = rect
    const numbers = [left, top, width, height]
    if (rect.length !== 5 || numbers.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
      issues.push(`Rectangle ${index} must be [left, top, width, height, kind] with finite numbers.`)
      return
    }
    if (left < 0 || top < 0 || width <= 0 || height <= 0 || left + width > 100.0001 || top + height > 100.0001) {
      issues.push(`Rectangle ${index} leaves the 100 × 100 frame.`)
    }
    if (!(wireKinds as readonly string[]).includes(kind)) {
      issues.push(`Rectangle ${index} has the unknown kind "${String(kind)}".`)
    }
  })
  return issues
}

/** Identity helper that types a wireframe literal. Validation happens in `defineSection`. */
export function defineWireframe(wireframe: Wireframe): Wireframe {
  return wireframe
}
