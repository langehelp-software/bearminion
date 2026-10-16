import { draftBannerText } from '../../draft-store.js'
import { useEditor } from '../state/editor.js'

/** Offers the unsaved draft this browser kept from an earlier visit. */
export function DraftBanner() {
  const { ui, restoreOffer, discardOffer } = useEditor()
  const offer = ui.draftOffer.value
  if (!offer) return null
  return (
    <div class="bm-banner bm-banner-ink" role="status" aria-label="Unsaved draft" style="top:16px;left:50%;transform:translateX(-50%);">
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

export function TabNotice() {
  const { ui } = useEditor()
  const notice = ui.tabNotice.value
  if (!notice) return null
  return (
    <div
      class="bm-banner bm-banner-light"
      role="status"
      aria-label="Saved in another tab"
      style="top:16px;right:16px;left:auto;transform:none;"
    >
      <span class="bm-dot bm-dot-info" />
      <div class="bm-banner-text">
        <p class="bm-banner-title">{notice}</p>
      </div>
    </div>
  )
}
