import { useEffect, useRef, useState } from 'preact/hooks'
import type { UploadedImage } from '../../api-types.js'
import { getImages } from '../api-client.js'
import { deleteFile, previewSrc, uploadFile } from '../image-field.js'
import { Icon } from '../icons.js'
import { useEditor } from '../state/editor.js'

/** The folder uploads land in, read from where they are: `src/assets/uploads/`. */
function folderOf(images: readonly UploadedImage[]): string {
  const first = images[0]?.path
  return first ? `${first.slice(0, first.lastIndexOf('/') + 1)}` : 'src/assets/uploads/'
}

/** Placeholder cards while the library loads: the grid keeps its shape instead of starting empty. */
const SKELETON_CARDS = 8

function MediaSkeleton() {
  return (
    <>
      <p class="bm-visually-hidden" role="status">
        Loading the image library.
      </p>
      <ul class="bm-media-grid" aria-hidden="true">
        {Array.from({ length: SKELETON_CARDS }, (_, index) => (
          <li key={index} class="bm-media-card bm-media-skeleton">
            <span class="bm-media-thumb bm-skeleton" />
            <span class="bm-skeleton bm-skeleton-line" />
            <span class="bm-skeleton bm-skeleton-line bm-skeleton-short" />
          </li>
        ))}
      </ul>
    </>
  )
}

/** A thumbnail shimmers until its file has loaded (or failed), then fades in. */
function settle(event: Event) {
  const img = event.currentTarget
  if (img instanceof HTMLElement) img.parentElement?.removeAttribute('data-loading')
}

/** A file on its way to the library: shown at once from a local blob URL, replaced by the real card when it lands. */
interface PendingUpload {
  id: number
  name: string
  url: string
  state: 'queued' | 'uploading'
}

let nextPendingId = 0

function PendingCard({ item }: { item: PendingUpload }) {
  return (
    <li class="bm-media-card bm-media-pending" aria-busy="true">
      <span class="bm-media-thumb" data-loading>
        <img src={item.url} alt="" decoding="async" onLoad={settle} />
        <span class="bm-media-progress" aria-hidden="true" />
      </span>
      <span class="bm-media-name" title={item.name}>
        {item.name}
      </span>
      <span class="bm-media-use">{item.state === 'uploading' ? 'Uploading…' : 'Waiting…'}</span>
    </li>
  )
}

/** The image library as a full-screen grid: what is there, where the saved content uses it, upload and delete. */
export function MediaView() {
  const { doc, ui } = useEditor()
  const [images, setImages] = useState<UploadedImage[] | null>(null)
  const [pending, setPending] = useState<PendingUpload[]>([])
  const busy = pending.length > 0
  const [dragging, setDragging] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  async function refresh() {
    const result = await getImages(true)
    if (result.ok) {
      setImages(result.value.images)
      return
    }
    ui.toasts.error('Could not load the image library.', { key: 'media-load', lines: [result.message] })
    // The toast says why. The grid stops loading and still offers the upload slot.
    setImages((current) => current ?? [])
  }

  useEffect(() => {
    void refresh()
  }, [])

  // Blob URLs of uploads still in flight when the view closes.
  const pendingRef = useRef(pending)
  pendingRef.current = pending
  useEffect(
    () => () => {
      for (const item of pendingRef.current) URL.revokeObjectURL(item.url)
    },
    [],
  )

  function settlePending(id: number) {
    setPending((current) => {
      const item = current.find((entry) => entry.id === id)
      if (item) URL.revokeObjectURL(item.url)
      return current.filter((entry) => entry.id !== id)
    })
  }

  async function upload(files: FileList | null | undefined) {
    const list = [...(files ?? [])].filter((file) => file.type.startsWith('image/'))
    if (list.length === 0) return
    const queued = list.map((file) => ({
      file,
      item: { id: nextPendingId++, name: file.name, url: URL.createObjectURL(file), state: 'queued' as const },
    }))
    setPending((current) => [...current, ...queued.map(({ item }) => item)])
    const failed: string[] = []
    // One at a time: each upload is a write to the repo, and the cards fill in in order.
    for (const { file, item } of queued) {
      setPending((current) => current.map((entry) => (entry.id === item.id ? { ...entry, state: 'uploading' } : entry)))
      const result = await uploadFile(file)
      if ('error' in result) failed.push(`${file.name}: ${result.error}`)
      else {
        const image = result.image
        doc.addImage(image)
        // Land the real card now, in sorted place; the refresh below fills in its usages.
        setImages((current) =>
          [...(current ?? []).filter((entry) => entry.path !== image.path), image].sort((a, b) => a.filename.localeCompare(b.filename)),
        )
      }
      settlePending(item.id)
    }
    if (failed.length > 0)
      ui.toasts.error(failed.length === 1 ? 'An upload failed.' : `${failed.length} uploads failed.`, { lines: failed })
    await refresh()
  }

  async function remove(image: UploadedImage) {
    const message = await deleteFile(image)
    if (message) {
      ui.toasts.error('Could not delete the image.', { lines: [message] })
      return
    }
    doc.dropImage(image)
    await refresh()
  }

  return (
    <div class="bm-listing bm-media">
      <header class="bm-listing-head">
        <div class="bm-listing-heading">
          <div class="bm-listing-title-row">
            <h1 class="bm-screen-title">Media</h1>
            <button type="button" class="bm-primary bm-listing-new" disabled={busy} onClick={() => input.current?.click()}>
              <Icon name="upload" size={16} />
              Upload
            </button>
            <input
              ref={input}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(event) => {
                void upload(event.currentTarget.files)
                event.currentTarget.value = ''
              }}
            />
          </div>
          <p class="bm-screen-file">{folderOf(images ?? [])}</p>
        </div>
      </header>
      {images === null ? (
        <MediaSkeleton />
      ) : (
        <ul class="bm-media-grid">
          {images.map((image) => {
            const usages = image.usages ?? []
            return (
              <li key={image.path} class="bm-media-card">
                <span class="bm-media-thumb" data-loading>
                  <img src={previewSrc(image.path)} alt="" loading="lazy" decoding="async" onLoad={settle} onError={settle} />
                </span>
                <span class="bm-media-name" title={image.path}>
                  {image.filename}
                </span>
                <span class="bm-media-use" title={usages.join('\n')}>
                  {usages.length === 0 ? 'Not used' : `Used on ${usages.join(', ')}`}
                </span>
                {usages.length === 0 && (
                  <button
                    type="button"
                    class="bm-icon-btn bm-danger bm-media-delete"
                    aria-label={`Delete ${image.filename}`}
                    title="Delete image"
                    onClick={() => void remove(image)}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                )}
              </li>
            )
          })}
          {pending.map((item) => (
            <PendingCard key={item.id} item={item} />
          ))}
          <li class="bm-media-card">
            <button
              type="button"
              class={dragging ? 'bm-media-drop bm-media-drop-on' : 'bm-media-drop'}
              onClick={() => input.current?.click()}
              onDragOver={(event) => {
                event.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault()
                setDragging(false)
                void upload(event.dataTransfer?.files)
              }}
            >
              <Icon name="image" size={22} />
              Drop images here
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}
