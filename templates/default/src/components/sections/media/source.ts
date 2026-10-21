/**
 * What a Media section's video link points at. YouTube and Vimeo links become privacy-friendly embeds
 * (youtube-nocookie.com, Vimeo with Do Not Track) that load only after the visitor presses play. A link to a video file
 * plays in a `<video>` element.
 */
export type MediaSource =
  | { kind: 'youtube'; id: string; embed: string; thumbnail: string }
  | { kind: 'vimeo'; id: string; embed: string }
  | { kind: 'file'; src: string }

const YOUTUBE =
  /^https?:\/\/(?:(?:www|m)\.)?(?:youtube\.com\/(?:watch\?(?:[^#\s]*&)?v=|embed\/|shorts\/|live\/)|youtube-nocookie\.com\/embed\/|youtu\.be\/)([\w-]{6,})(?:[?&#][^\s]*)?$/i
const VIMEO = /^https?:\/\/(?:(?:www|player)\.)?vimeo\.com\/(?:video\/)?(\d+)(?:[/?#][^\s]*)?$/i
/** A path in `public/` (`/videos/demo.webm`) or an `https://` link to a video file. */
export const VIDEO_FILE = /^(?:\/(?!\/)|https?:\/\/)\S+\.(?:mp4|webm|m4v|mov|ogv)(?:[?#]\S*)?$/i

export function parseMediaSource(value: string): MediaSource | null {
  const src = value.trim()
  const youtube = YOUTUBE.exec(src)
  if (youtube?.[1]) {
    const id = youtube[1]
    return {
      kind: 'youtube',
      id,
      embed: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`,
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    }
  }
  const vimeo = VIMEO.exec(src)
  if (vimeo?.[1]) return { kind: 'vimeo', id: vimeo[1], embed: `https://player.vimeo.com/video/${vimeo[1]}?autoplay=1&dnt=1` }
  if (VIDEO_FILE.test(src)) return { kind: 'file', src }
  return null
}
