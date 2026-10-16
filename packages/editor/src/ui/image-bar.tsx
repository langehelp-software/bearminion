import { DEFAULT_IMAGE_POSITION, IMAGE_FITS, IMAGE_POSITIONS, type ImageFit, type ImagePosition } from '../image-layout.js'

const FIT_LABEL: Record<ImageFit, string> = { cover: 'Cover', contain: 'Contain', auto: 'Auto' }

/** Smallest image the bar fits on. Below this the outline and a click are all you get. */
export const IMAGE_BAR_MIN_WIDTH = 260
export const IMAGE_BAR_MIN_HEIGHT = 64

function label(position: ImagePosition): string {
  return position.replace(/^./, (letter) => letter.toUpperCase())
}

/** Floating bar over the hovered image: fit, position and Change. Sits inside the image so the pointer never leaves it on the way. */
export function ImageBar({
  top,
  right,
  fit,
  position,
  onFit,
  onPosition,
  onChange,
}: {
  top: number
  right: number
  fit: ImageFit
  position: ImagePosition
  onFit: (fit: ImageFit) => void
  onPosition: (position: ImagePosition) => void
  onChange: () => void
}) {
  return (
    <div class="bm-rich bm-image-bar" role="toolbar" aria-label="Image layout" style={`top:${top}px;right:${right}px;`}>
      <div class="bm-image-bar-group" role="group" aria-label="Image fit">
        {IMAGE_FITS.map((choice) => (
          <button type="button" key={choice} aria-pressed={fit === choice} onClick={() => onFit(choice)}>
            {FIT_LABEL[choice]}
          </button>
        ))}
      </div>
      <span class="bm-sep" aria-hidden="true" />
      <div class="bm-image-bar-grid" role="group" aria-label="Image position">
        {IMAGE_POSITIONS.map((choice) => (
          <button
            type="button"
            key={choice}
            class="bm-pos-cell"
            aria-pressed={position === choice}
            aria-label={label(choice)}
            title={position === choice && choice !== DEFAULT_IMAGE_POSITION ? 'Click again to reset to center' : label(choice)}
            disabled={fit === 'auto'}
            onClick={() => onPosition(position === choice ? DEFAULT_IMAGE_POSITION : choice)}
          />
        ))}
      </div>
      <span class="bm-sep" aria-hidden="true" />
      <button type="button" onClick={onChange}>
        Change
      </button>
    </div>
  )
}
