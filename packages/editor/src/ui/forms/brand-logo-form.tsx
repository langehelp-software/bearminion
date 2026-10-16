import { getAt } from '../../draft.js'
import { type LibraryImage, ImageField } from '../image-field.js'
import { Info } from '../info.js'
import { isImageRecord, text } from '../shared.js'
import type { SiteDraft } from '../types.js'
import { Segmented } from './segmented.js'

const LOGO_HEIGHT = { min: 16, max: 64, default: 28 }

/** Header and footer brand: the name as text, or a logo image with its own height. */
export function BrandLogoForm({
  site,
  images,
  onField,
  onUploaded,
  onDeleted,
}: {
  site: SiteDraft
  images: LibraryImage[]
  onField: (path: string, value: unknown) => void
  onUploaded: (image: LibraryImage) => void
  onDeleted: (image: LibraryImage) => void
}) {
  const stored = getAt(site, 'brandLogo')
  const logo = isImageRecord(stored) ? (stored as { src: string; alt: string; height?: number }) : undefined
  const height = typeof logo?.height === 'number' ? logo.height : undefined
  return (
    <div class="bm-stack">
      <p class="bm-group">Brand</p>
      <Segmented
        label="Shown in header and footer"
        value={logo ? 'image' : 'text'}
        options={[
          { value: 'text', label: 'Name' },
          { value: 'image', label: 'Logo image' },
        ]}
        onChange={(value) => onField('brandLogo', value === 'image' ? { src: 'placeholder', alt: text(site.name) } : undefined)}
      />
      {logo && (
        <>
          <ImageField
            label="Logo image"
            path="brandLogo"
            layout={false}
            value={logo}
            images={images}
            onChange={(next) => onField('brandLogo', { ...next, ...(height !== undefined ? { height } : {}) })}
            onUploaded={onUploaded}
            onDeleted={onDeleted}
          />
          <div class="bm-field">
            <span class="bm-label-row bm-label">
              <span class="bm-label-text">
                <label for="bm-logo-height">Logo height</label>
                <Info label="About logo height" text="The header grows with the logo." />
              </span>
              <span class="bm-meta-tag">
                {height ?? LOGO_HEIGHT.default} px{height === undefined ? ' · auto' : ''}
              </span>
            </span>
            <div class="bm-colorrow">
              <input
                id="bm-logo-height"
                class="bm-range"
                type="range"
                min={LOGO_HEIGHT.min}
                max={LOGO_HEIGHT.max}
                step={2}
                value={height ?? LOGO_HEIGHT.default}
                onInput={(event) => onField('brandLogo.height', Number(event.currentTarget.value))}
              />
              {height !== undefined && (
                <button type="button" class="bm-tertiary" onClick={() => onField('brandLogo.height', undefined)}>
                  Reset
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
