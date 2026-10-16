import { DEFAULT_IMAGE_FIT, DEFAULT_IMAGE_POSITION, isImageFit, isImagePosition, withImageLayout } from '../../image-layout.js'
import { ImageBar } from '../image-bar.js'
import { ImagePickerModal } from '../image-field.js'
import { imageSrcAt } from '../site-draft.js'
import { isPagePath } from '../state/document.js'
import { useEditor } from '../state/editor.js'
import { boxStyle } from '../styles.js'

/** The hovered section's outline, or the hovered field's when the pointer is on one. */
export function Outlines() {
  const { overlay } = useEditor()
  const field = overlay.field.value
  const hoverRect = overlay.hoverRect.value
  if (field) {
    const image = field.image && !field.bar
    return (
      <div class={image ? 'bm-outline bm-outline-field bm-outline-image' : 'bm-outline bm-outline-field'} style={boxStyle(field.rect)} />
    )
  }
  return hoverRect ? <div class="bm-outline bm-outline-section" style={boxStyle(hoverRect, 4)} /> : null
}

/** Fit, position and Change over the hovered section image. */
export function ImageBarOverlay() {
  const { overlay, edits, openImagePicker } = useEditor()
  const bar = overlay.field.value?.bar
  if (!bar) return null
  return (
    <ImageBar
      top={bar.top}
      right={bar.right}
      fit={isImageFit(bar.value.fit) ? bar.value.fit : DEFAULT_IMAGE_FIT}
      position={isImagePosition(bar.value.position) ? bar.value.position : DEFAULT_IMAGE_POSITION}
      onFit={(fit) => edits.writeField(bar.path, withImageLayout(bar.value, { fit }))}
      onPosition={(position) => edits.writeField(bar.path, withImageLayout(bar.value, { position }))}
      onChange={() => openImagePicker(bar.field)}
    />
  )
}

/** The image library over the page, for the image that was clicked. */
export function PageImagePicker() {
  const { doc, ui, edits } = useEditor()
  const path = ui.pagePick.value
  if (!path) return null
  return (
    <ImagePickerModal
      src={imageSrcAt(isPagePath(path) ? doc.page.value : doc.site.value, path)}
      images={doc.images.value}
      onPick={(src) => edits.replaceImage(path, src)}
      onUploaded={doc.addImage}
      onDeleted={doc.dropImage}
      onClose={() => {
        ui.pagePick.value = null
      }}
    />
  )
}
