import { draftBannerText } from '../../draft-store.js'
import { useEditor } from '../state/editor.js'

/** Offers the unsaved draft this browser kept from an earlier visit. */
export function DraftBanner() {
  const { ui, restoreOffer, discardOffer } = useEditor()
  const offer = ui.draftOffer.value
  if (!offer) return null
  return (
    <div class="bm-banner bm-banner-ink" role="status" aria-label="Unsaved draft" style="top:72px;left:50%;transform:translateX(-50%);">
      <span class={offer.conflict ? 'bm-dot bm-dot-stale' : 'bm-dot bm-dot-dirty'} />
      <div class="bm-banner-text">
        <p class="bm-banner-title">{draftBannerText(offer.savedAt, Date.now())}</p>
        <p class="bm-banner-sub">
          {offer.conflict ? 'The file on disk has changed since this draft.' : 'Kept in this browser until you save or discard.'}
        </p>
      </div>
      <div class="bm-actions">
        <button type="button" class="bm-primary" onClick={restoreOffer}>
          Restore
        </button>
        <button type="button" onClick={discardOffer}>
          Discard
        </button>
      </div>
    </div>
  )
}
