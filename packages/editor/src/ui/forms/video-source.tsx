import { useEffect, useRef, useState } from 'preact/hooks'
import { parseMediaSource } from '../../media-source.js'
import { VIDEO_WARN_BYTES } from '../../videos-shared.js'
import { getVideos, uploadVideo } from '../api-client.js'
import type { UploadedVideo } from '../../api-types.js'

/** What a pasted video link is, or why it will not play. Empty for no link. */
export function describeVideoLink(value: string): { ok: boolean; text: string } | null {
  const link = value.trim()
  if (link === '') return null
  const source = parseMediaSource(link)
  if (source?.kind === 'youtube') return { ok: true, text: 'YouTube video. It loads nothing until the visitor presses play.' }
  if (source?.kind === 'vimeo') return { ok: true, text: 'Vimeo video. It loads nothing until the visitor presses play.' }
  if (source?.kind === 'file') return { ok: true, text: 'Video file.' }
  if (/^https?:\/\//i.test(link)) {
    return {
      ok: false,
      text: 'That is a page link, not a video. Use a YouTube or Vimeo link, or a link to a file ending in .mp4 or .webm.',
    }
  }
  return {
    ok: false,
    text: 'Use a YouTube or Vimeo link, a link to a video file ending in .mp4 or .webm, or a path in public/ such as /videos/demo.webm.',
  }
}

const megabytes = (bytes: number) => `${(bytes / 1_048_576).toFixed(bytes < 10_485_760 ? 1 : 0)} MB`

/** Under a video link field: says what the link is, uploads a video file, and picks one already uploaded. */
export function VideoSourceTools({ value, onPick }: { value: string; onPick: (url: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [library, setLibrary] = useState<UploadedVideo[]>([])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    void getVideos().then((result) => {
      if (live && result.ok) setLibrary(result.value.videos)
    })
    return () => {
      live = false
    }
  }, [])

  async function upload(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError('')
    setNote('')
    const result = await uploadVideo(file)
    setBusy(false)
    if (!result.ok) {
      setError(result.status === 0 ? 'Upload failed.' : result.message)
      return
    }
    setLibrary((current) => [...current.filter((item) => item.url !== result.value.url), result.value])
    onPick(result.value.url)
    if ((result.value.bytes ?? 0) > VIDEO_WARN_BYTES) {
      setNote(`${megabytes(result.value.bytes ?? 0)}: it is slow to load on every visit. YouTube or Vimeo is kinder to visitors.`)
    }
  }

  const detected = describeVideoLink(value)
  return (
    <div class="bm-stack bm-stack-tight">
      {detected ? (
        <span class={detected.ok ? 'bm-hint' : 'bm-error'} role={detected.ok ? undefined : 'alert'}>
          {detected.text}
        </span>
      ) : (
        <span class="bm-hint">Paste a YouTube or Vimeo link as it is, or upload a video file.</span>
      )}
      <input
        ref={input}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,video/ogg"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          void upload(file)
        }}
      />
      <button type="button" class="bm-add bm-add-row" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? 'Uploading…' : 'Upload a video file'}
      </button>
      {library.length > 0 && (
        <label class="bm-field">
          <span class="bm-label">Uploaded videos</span>
          <select
            value=""
            aria-label="Uploaded videos"
            onChange={(event) => event.currentTarget.value && onPick(event.currentTarget.value)}
          >
            <option value="">Choose one…</option>
            {library.map((video) => (
              <option key={video.url} value={video.url}>
                {video.filename}
                {video.bytes ? ` (${megabytes(video.bytes)})` : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      {note && <span class="bm-hint">{note}</span>}
      {error && (
        <span class="bm-error" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
