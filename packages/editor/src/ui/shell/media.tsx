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

/** The image library as a full-screen grid: what is there, where the saved content uses it, upload and delete. */
export function MediaView() {
  const { doc } = useEditor()
  const [images, setImages] = useState<UploadedImage[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  async function refresh() {
    const result = await getImages(true)
    if (result.ok) setImages(result.value.images)
    else setError(result.message)
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function upload(files: FileList | null | undefined) {
    const list = [...(files ?? [])].filter((file) => file.type.startsWith('image/'))
    if (list.length === 0) return
    setBusy(true)
    setError('')
    const failed: string[] = []
    for (const file of list) {
      const result = await uploadFile(file)
      if ('error' in result) failed.push(`${file.name}: ${result.error}`)
      else doc.addImage(result.image)
    }
    setBusy(false)
    if (failed.length > 0) setError(failed.join(' '))
    await refresh()
  }

  async function remove(image: UploadedImage) {
    setError('')
    const message = await deleteFile(image)
    if (message) {
      setError(message)
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
              {busy ? 'Uploading…' : 'Upload'}
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
      {error && (
        <p class="bm-error" role="alert">
          {error}
        </p>
      )}
      {images === null ? (
        <p class="bm-note">Loading the image library.</p>
      ) : (
        <ul class="bm-media-grid">
          {images.map((image) => {
            const usages = image.usages ?? []
            return (
              <li key={image.path} class="bm-media-card">
                <span class="bm-media-thumb">
                  <img src={previewSrc(image.path)} alt="" loading="lazy" />
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
