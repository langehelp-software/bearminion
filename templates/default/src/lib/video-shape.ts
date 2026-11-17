import type { MediaSource } from 'bearminion'

/** A video's own width and height, in any unit: only the ratio is used. */
export interface VideoShape {
  width: number
  height: number
}

/** YouTube's player is always 16:9 and letterboxes inside itself, in black. */
const YOUTUBE: VideoShape = { width: 16, height: 9 }

// One lookup per video for the life of the build or server, including failures, so a page with the same video twice,
// or the editor redrawing as someone types, asks Vimeo once.
const vimeoShapes = new Map<string, Promise<VideoShape | undefined>>()

async function vimeoShape(id: string): Promise<VideoShape | undefined> {
  try {
    const url = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(`https://vimeo.com/${id}`)}`
    const response = await fetch(url, { signal: AbortSignal.timeout(5000), headers: { accept: 'application/json' } })
    if (!response.ok) return undefined
    const data: unknown = await response.json()
    if (typeof data !== 'object' || data === null) return undefined
    const { width, height } = data as { width?: unknown; height?: unknown }
    if (typeof width !== 'number' || typeof height !== 'number' || width <= 0 || height <= 0) return undefined
    return { width, height }
  } catch {
    return undefined
  }
}

/**
 * The shape an embedded player has to have to show its video without bars. An embed cannot be cropped the way an image
 * or a video file can, so the section's Shape setting would only add bars around it. Vimeo is asked at build time (on
 * the server for the editor); a video it will not describe (private, or Vimeo unreachable) keeps the Shape setting.
 * A video file returns `undefined`: it is cropped to the Shape setting instead.
 */
export function videoShape(source: MediaSource | null): Promise<VideoShape | undefined> {
  if (source?.kind === 'youtube') return Promise.resolve(YOUTUBE)
  if (source?.kind !== 'vimeo') return Promise.resolve(undefined)
  let found = vimeoShapes.get(source.id)
  if (!found) {
    found = vimeoShape(source.id)
    vimeoShapes.set(source.id, found)
  }
  return found
}
