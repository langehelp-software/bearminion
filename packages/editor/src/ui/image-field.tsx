import { Info } from './info.js'
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import {
  DEFAULT_IMAGE_FIT,
  DEFAULT_IMAGE_POSITION,
  IMAGE_FITS,
  IMAGE_POSITIONS,
  isImageFit,
  isImagePosition,
  type ImageFit,
  type ImagePosition,
} from '../image-layout.js'
import { Icon } from './icons.js'
import { draftImageUsages } from '../asset-paths.js'
import { deleteImage, uploadImage } from './api-client.js'
import { ScrollLock } from './scroll-lock.js'
import { useEditor } from './state/editor.js'

export interface LibraryImage {
  filename: string
  path: string
}

export interface ImageValue {
  src: string
  alt: string
  /** Omitted at the default, cover. */
  fit?: ImageFit
  /** Omitted at the default, center. */
  position?: ImagePosition
  /** Section images only: true hides the image and its frame on the page. Omitted when shown. */
  hidden?: boolean
}

const FIT_LABEL: Record<ImageFit, string> = { cover: 'Cover', contain: 'Contain', auto: 'Auto' }
const FIT_HINT: Record<ImageFit, string> = {
  cover: 'Fills the frame and crops the overflow.',
  contain: 'Shows the whole image inside the frame.',
  auto: 'Keeps the image’s own size and aspect ratio.',
}
const POSITION_LABEL: Record<ImagePosition, string> = {
  'top left': 'Top left',
  top: 'Top',
  'top right': 'Top right',
  left: 'Left',
  center: 'Center',
  right: 'Right',
  'bottom left': 'Bottom left',
  bottom: 'Bottom',
  'bottom right': 'Bottom right',
}

/** Drop the keys that equal their default so saved JSON only holds real choices. */
function compact(next: ImageValue): ImageValue {
  const { fit, position, hidden, ...rest } = next
  return {
    ...rest,
    ...(hidden === true ? { hidden } : {}),
    ...(fit && fit !== DEFAULT_IMAGE_FIT ? { fit } : {}),
    ...(position && position !== DEFAULT_IMAGE_POSITION ? { position } : {}),
  }
}

/**
 * True when `src` is a local image whose file is gone. The dev route answers HEAD with 404 for those; remote URLs and
 * placeholders are never "missing". Rechecks whenever the path changes.
 */
function useMissingFile(src: string): boolean {
  const [missing, setMissing] = useState(false)
  useEffect(() => {
    const url = previewSrc(src)
    if (!url.startsWith('/__bearminion/assets?')) {
      setMissing(false)
      return
    }
    let current = true
    fetch(url, { method: 'HEAD', cache: 'no-store' })
      .then((response) => {
        if (current) setMissing(response.status === 404)
      })
      .catch(() => {
        if (current) setMissing(false)
      })
    return () => {
      current = false
    }
  }, [src])
  return missing
}

export function previewSrc(src: string): string {
  if (src === '' || src === 'placeholder') return ''
  if (/^https?:\/\//i.test(src) || src.startsWith('/')) return src
  return `/__bearminion/assets?src=${encodeURIComponent(src.replace(/^\//, ''))}`
}

/** Only react to files. Dragging text or a link over a drop target is not an upload. */
function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}

function fileName(src: string): string {
  return src.split('/').pop() || src
}

type ModalTab = 'upload' | 'library'

/** The tab last used in this page session, so a second pick starts where the first ended. */
let lastTab: ModalTab | null = null

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/avif'
const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), [tabindex="0"]'

/**
 * One control for every image in the editor. Empty: a slot that opens the picker.
 * Filled: thumbnail, file name, alt text, Change and Remove. The picker is a modal
 * with an Upload tab (drop or browse) and a Library tab (pick or delete).
 */
export function ImageField({
  label,
  path,
  value,
  images,
  withAlt = true,
  layout = true,
  hideable = false,
  onChange,
  onUploaded,
  onDeleted,
}: {
  label: string
  path: string
  value: { src?: string; alt?: string; fit?: unknown; position?: unknown; hidden?: unknown } | undefined
  images: LibraryImage[]
  /** False for fields that store a path only, such as an OG image. */
  withAlt?: boolean
  /** False hides Fit and Position, for images whose frame is not the image, such as logos. */
  layout?: boolean
  /** Adds a "Show in section" switch, for images that sit in a section. */
  hideable?: boolean
  onChange: (next: ImageValue) => void
  onUploaded: (image: LibraryImage) => void
  onDeleted: (image: LibraryImage) => void
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [over, setOver] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const src = typeof value?.src === 'string' ? value.src : ''
  const alt = typeof value?.alt === 'string' ? value.alt : ''
  const fit: ImageFit = isImageFit(value?.fit) ? value.fit : DEFAULT_IMAGE_FIT
  const position: ImagePosition = isImagePosition(value?.position) ? value.position : DEFAULT_IMAGE_POSITION
  const showLayout = layout && withAlt
  const hidden = hideable && value?.hidden === true
  const current: ImageValue = { src, alt, fit, position, ...(hidden ? { hidden } : {}) }
  /** Emit the whole image object. A new file or alt keeps the fit and position already chosen. */
  const emit = (patch: Partial<ImageValue>) => onChange(compact({ ...current, ...patch }))
  const empty = src === '' || src === 'placeholder'
  const shown = previewSrc(src)
  const missing = useMissingFile(empty ? '' : src)
  const fallbackAlt = withAlt ? 'Image' : ''

  function openPicker(trigger: HTMLElement) {
    opener.current = trigger
    setError('')
    setOpen(true)
  }

  function closePicker() {
    setOpen(false)
    // The slot unmounts once it holds an image, so fall back to the card.
    requestAnimationFrame(() => {
      const target = opener.current?.isConnected ? opener.current : root.current
      target?.focus()
    })
  }

  /** A file dropped on the card replaces the image without opening the picker. */
  async function upload(file: File | undefined) {
    if (!file) return
    setError('')
    const result = await uploadFile(file)
    if ('error' in result) {
      setError(result.error)
      return
    }
    onUploaded(result.image)
    emit({ src: result.image.path, alt: alt || fallbackAlt })
  }

  const trashed = () => onChange({ src: withAlt ? 'placeholder' : '', alt: '', ...(hidden ? { hidden } : {}) })

  /** An empty image has no file yet; the placeholder keeps the saved object valid while it is hidden. */
  const setShown = (show: boolean) => emit({ hidden: show ? undefined : true, src: src === '' ? 'placeholder' : src })

  return (
    <div
      class={over ? 'bm-imagefield bm-drop-files' : 'bm-imagefield'}
      data-editor-field={path}
      tabIndex={-1}
      ref={root}
      data-drop-hint={over ? 'Drop to upload' : undefined}
      onDragOver={(event) => {
        if (open || !hasFiles(event)) return
        event.preventDefault()
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
        if (!over) setOver(true)
      }}
      onDragLeave={(event) => {
        const next = event.relatedTarget
        if (next instanceof Node && event.currentTarget.contains(next)) return
        setOver(false)
      }}
      onDrop={(event) => {
        if (open || !hasFiles(event)) return
        event.preventDefault()
        setOver(false)
        void upload(event.dataTransfer?.files[0])
      }}
    >
      <span class="bm-label">
        <span class="bm-label-row">
          <span class="bm-label-text">{label}</span>
          {withAlt && !empty && <span class="bm-meta-tag">alt required</span>}
        </span>
      </span>
      {hideable && (
        <label class="bm-switch-row">
          <span class="bm-switch-text">
            <span class="bm-switch-title">
              Show in section
              <Info
                label="About showing the image"
                text="Turn off to remove the image and its frame from the section. The chosen file stays, so turning it back on restores it."
              />
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            aria-label={`Show ${label.toLowerCase()} in section`}
            checked={!hidden}
            onChange={(event) => setShown(event.currentTarget.checked)}
          />
        </label>
      )}
      {empty ? (
        <button type="button" class="bm-slot" onClick={(event) => openPicker(event.currentTarget)}>
          <Icon name="upload" size={16} />
          <span class="bm-slot-title">Add image</span>
          <span class="bm-slot-hint">Upload a file or pick from the library</span>
        </button>
      ) : (
        <>
          <div class="bm-card">
            <div class="bm-image-row">
              {shown ? <img class="bm-thumb" src={shown} alt="" /> : <span class="bm-thumb bm-stripes" aria-hidden="true" />}
              <div class="bm-image-meta">
                <span class="bm-image-path" title={src}>
                  {fileName(src)}
                </span>
              </div>
              <div class="bm-row bm-image-actions">
                <button type="button" aria-label="Change image" onClick={(event) => openPicker(event.currentTarget)}>
                  Change
                </button>
                <button type="button" class="bm-icon-btn bm-danger" aria-label="Remove image" title="Remove image" onClick={trashed}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
            </div>
            {showLayout && (
              <div class="bm-layout">
                <div class="bm-layout-row">
                  <span class="bm-label">
                    <span class="bm-label-text">
                      Fit
                      <Info
                        label="About image fit"
                        text={
                          fit === 'auto'
                            ? FIT_HINT.auto
                            : `${FIT_HINT[fit]} Anchored ${position === 'center' ? 'in the center' : position}.`
                        }
                      />
                    </span>
                  </span>
                  <div class="bm-segmented" role="radiogroup" aria-label="Image fit">
                    {IMAGE_FITS.map((choice) => (
                      <button type="button" key={choice} role="radio" aria-checked={fit === choice} onClick={() => emit({ fit: choice })}>
                        {FIT_LABEL[choice]}
                      </button>
                    ))}
                  </div>
                </div>
                <div class="bm-layout-row">
                  <span class="bm-label">Position</span>
                  <div class="bm-position" role="radiogroup" aria-label="Image position">
                    {IMAGE_POSITIONS.map((choice) => (
                      <button
                        type="button"
                        key={choice}
                        role="radio"
                        class="bm-position-cell"
                        aria-checked={position === choice}
                        aria-label={POSITION_LABEL[choice]}
                        title={
                          position === choice && choice !== DEFAULT_IMAGE_POSITION
                            ? 'Click again to reset to center'
                            : POSITION_LABEL[choice]
                        }
                        disabled={fit === 'auto'}
                        onClick={() => emit({ position: position === choice ? DEFAULT_IMAGE_POSITION : choice })}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          {withAlt && (
            <input
              class="bm-alt"
              aria-label="Alt"
              placeholder="Alt text: describe the image"
              value={alt}
              onInput={(event) => emit({ alt: event.currentTarget.value })}
            />
          )}
        </>
      )}
      {missing && (
        <p class="bm-error" role="status">
          File not found: {fileName(src)}. Choose another image, or the page cannot be saved.
        </p>
      )}
      {error && <p class="bm-error">{error}</p>}
      {open && (
        <ImagePickerModal
          src={src}
          images={images}
          onPick={(path) => emit({ src: path, alt: alt || fallbackAlt })}
          onUploaded={onUploaded}
          onDeleted={onDeleted}
          onClose={closePicker}
        />
      )}
    </div>
  )
}

async function uploadFile(file: File): Promise<{ image: LibraryImage } | { error: string }> {
  const result = await uploadImage(file)
  if (!result.ok) return { error: result.status === 0 ? 'Upload failed.' : result.message }
  return { image: result.value }
}

/** Resolves to an error message, or null when the file is gone. */
async function deleteFile(image: LibraryImage): Promise<string | null> {
  const result = await deleteImage(image.filename)
  if (result.ok || result.status === 404) return null
  return result.status === 0 ? 'Delete failed.' : result.message
}

/**
 * The picker dialog: Upload tab (drop or browse) and Library tab (pick or delete).
 * Standalone on purpose. It is mounted either inside an image card in the sidebar or at the
 * editor root, so clicking an image on the page opens it without opening the sidebar.
 */
export function ImagePickerModal({
  src,
  images,
  onPick,
  onUploaded,
  onDeleted,
  onClose,
}: {
  /** The image currently in use, marked as pressed in the library. */
  src: string
  images: LibraryImage[]
  onPick: (path: string) => void
  onUploaded: (image: LibraryImage) => void
  onDeleted: (image: LibraryImage) => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<ModalTab>(lastTab ?? (images.length > 0 ? 'library' : 'upload'))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<LibraryImage | null>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const { doc } = useEditor()

  function switchTab(next: ModalTab) {
    lastTab = next
    setTab(next)
    setPendingDelete(null)
    setError('')
  }

  // Layout effect: focus and the Escape listener are in place before the dialog is painted, so a key pressed the
  // moment it appears still closes it.
  useLayoutEffect(() => {
    const node = dialog.current
    if (pendingDelete) node?.querySelector<HTMLElement>('.bm-modal-confirm .bm-actions button:last-child')?.focus()
    else node?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        if (pendingDelete) setPendingDelete(null)
        else onClose()
        return
      }
      if (event.key !== 'Tab' || !node) return
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (items.length === 0) return
      const rootNode = node.getRootNode()
      const active = rootNode instanceof ShadowRoot ? rootNode.activeElement : document.activeElement
      const index = items.indexOf(active as HTMLElement)
      event.preventDefault()
      const next = event.shiftKey
        ? items[(index <= 0 ? items.length : index) - 1]
        : items[index < 0 || index === items.length - 1 ? 0 : index + 1]
      next?.focus()
    }
    node?.addEventListener('keydown', onKey)
    return () => node?.removeEventListener('keydown', onKey)
    // onClose is stable enough for a dialog that closes itself.
  }, [pendingDelete])

  async function upload(file: File | undefined) {
    if (!file) return
    setError('')
    setBusy(true)
    const result = await uploadFile(file)
    setBusy(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    onUploaded(result.image)
    onPick(result.image.path)
    onClose()
  }

  async function remove(image: LibraryImage) {
    setError('')
    // The server only knows what is saved. An image the unsaved draft points at is refused here, so saving that
    // draft never meets a missing file.
    const drafted = draftImageUsages(image.path, { page: doc.page.peek(), site: doc.site.peek() }, doc.catalog.peek()?.sectionLabels ?? {})
    if (drafted.length > 0) {
      setPendingDelete(null)
      setError(`${image.filename} is still used: ${drafted.join('; ')}. Choose another image there, then delete it.`)
      return
    }
    const failure = await deleteFile(image)
    if (failure) {
      // An image still in use is refused; close the confirm so the reason, which names where, is what shows.
      setPendingDelete(null)
      setError(failure)
      return
    }
    onDeleted(image)
    setPendingDelete(null)
  }

  return (
    <div
      class="bm-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <ScrollLock />
      <div class="bm-modal" role="dialog" aria-modal="true" aria-label="Choose image" ref={dialog}>
        <div class="bm-modal-head">
          <h2 class="bm-dialog-title">Choose image</h2>
          <span class="bm-meta-tag">src/assets/uploads</span>
          <button type="button" class="bm-icon-btn" aria-label="Close" title="Close (Esc)" onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </div>
        <div
          class="bm-tabs"
          role="tablist"
          aria-label="Image source"
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
            event.preventDefault()
            const next: ModalTab = tab === 'upload' ? 'library' : 'upload'
            switchTab(next)
            requestAnimationFrame(() => dialog.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus())
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'upload'}
            tabIndex={tab === 'upload' ? 0 : -1}
            onClick={() => switchTab('upload')}
          >
            Upload
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'library'}
            tabIndex={tab === 'library' ? 0 : -1}
            onClick={() => switchTab('library')}
          >
            Library <span class="bm-meta-tag">{images.length}</span>
          </button>
        </div>
        <div class="bm-modal-body" role="tabpanel">
          {tab === 'upload' ? (
            <label
              class={over ? 'bm-dropzone bm-dropzone-over' : 'bm-dropzone'}
              onDragOver={(event) => {
                if (!hasFiles(event)) return
                event.preventDefault()
                if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
                if (!over) setOver(true)
              }}
              onDragLeave={(event) => {
                const next = event.relatedTarget
                if (next instanceof Node && event.currentTarget.contains(next)) return
                setOver(false)
              }}
              onDrop={(event) => {
                if (!hasFiles(event)) return
                event.preventDefault()
                setOver(false)
                void upload(event.dataTransfer?.files[0])
              }}
            >
              <Icon name="upload" size={20} />
              <span class="bm-slot-title">{busy ? 'Uploading…' : 'Drag an image here'}</span>
              <span class="bm-slot-hint">or click to browse · png, jpeg, webp, gif, avif · up to 5MB</span>
              <input
                class="bm-visually-hidden"
                aria-label="Upload image"
                type="file"
                accept={ACCEPT}
                disabled={busy}
                onChange={(event) => {
                  const input = event.currentTarget
                  void upload(input.files?.[0]).then(() => {
                    input.value = ''
                  })
                }}
              />
            </label>
          ) : images.length === 0 ? (
            <div class="bm-library-empty">
              <p class="bm-note">No uploads yet.</p>
              <button type="button" onClick={() => switchTab('upload')}>
                Upload an image
              </button>
            </div>
          ) : (
            <div class="bm-library" role="list">
              {images.map((image) => (
                <div class="bm-library-item" role="listitem" key={image.path}>
                  <button
                    type="button"
                    class="bm-library-pick"
                    aria-pressed={image.path === src}
                    title={image.path}
                    onClick={() => {
                      onPick(image.path)
                      onClose()
                    }}
                  >
                    <img src={previewSrc(image.path)} alt="" />
                    <span>{image.filename}</span>
                  </button>
                  <button
                    type="button"
                    class="bm-icon-btn bm-library-delete"
                    aria-label={`Delete ${image.filename}`}
                    title="Delete file"
                    onClick={() => setPendingDelete(image)}
                  >
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {error && <p class="bm-error">{error}</p>}
        </div>
        {pendingDelete && (
          <div class="bm-modal-confirm" role="alert">
            <p class="bm-note">
              Delete <strong>{pendingDelete.filename}</strong> from disk? An image that a saved page or the site settings still use cannot
              be deleted; choose another image there first.
            </p>
            <div class="bm-actions">
              <button type="button" class="bm-primary bm-danger" onClick={() => void remove(pendingDelete)}>
                Delete image
              </button>
              <button type="button" onClick={() => setPendingDelete(null)}>
                Keep
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
