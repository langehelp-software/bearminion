import { getAt, type PageDraft } from '../draft.js'
import { themeCss } from '../theme-colors.js'
import { previewPage, previewSite } from './api-client.js'
import { announcePreview, swapOrganism } from './dom.js'
import { runNewScripts, scriptsOnPage } from './state/live-preview.js'
import { themeColorsOf } from './site-draft.js'
import type { SiteDraft } from './types.js'

/** On the `<iframe>` of a tablet or mobile frame. The editor script inside it mirrors the draft instead of mounting. */
export const DEVICE_FRAME_ATTR = 'data-bearminion-device'

/** What the editor sends to a device frame: the drafts, as the canvas shows them. */
export interface DeviceDraft {
  type: 'bearminion:device-draft'
  page: PageDraft | null
  site: SiteDraft | null
  /** The content type the page is checked as; absent for a listing page. */
  docType?: string
}

export const DEVICE_READY = 'bearminion:device-ready'

/** True inside a device frame of the editor. The frame is same-origin, so its element can be read. */
export function inDeviceFrame(): boolean {
  try {
    return window.frameElement?.hasAttribute(DEVICE_FRAME_ATTR) === true
  } catch {
    return false
  }
}

/**
 * The page inside a device frame: no editor, just the unsaved draft rendered the way the live preview renders it, so
 * the frame shows what the canvas shows at a tablet or phone width with the site's own media queries. Links do not
 * navigate: the frame follows the document open in the editor.
 */
export function mountDeviceMirror(): void {
  document.documentElement.setAttribute('data-bearminion-device-frame', '')
  document.addEventListener(
    'click',
    (event) => {
      if (event.target instanceof Element && event.target.closest('a[href]')) event.preventDefault()
    },
    true,
  )
  let seq = 0
  let lastPage = ''
  let lastSite = ''
  window.addEventListener('message', (event: MessageEvent<DeviceDraft>) => {
    if (event.origin !== location.origin || event.source !== window.parent || event.data?.type !== 'bearminion:device-draft') return
    const { page, site, docType } = event.data
    const run = ++seq
    const pageJson = JSON.stringify(page)
    const siteJson = JSON.stringify(site)
    if (site && siteJson !== lastSite) {
      lastSite = siteJson
      const mode = getAt(site, 'theme.mode')
      if (mode === 'light' || mode === 'dark') document.documentElement.setAttribute('data-theme', mode)
      let style = document.getElementById('bm-theme')
      if (!style) {
        style = document.createElement('style')
        style.id = 'bm-theme'
        document.head.append(style)
      }
      style.textContent = themeCss(themeColorsOf(site))
      void previewSite(site, location.pathname).then((result) => {
        if (run !== seq || !result.ok) return
        if (typeof result.value.header === 'string') swapOrganism('header', result.value.header)
        if (typeof result.value.footer === 'string') swapOrganism('footer', result.value.footer)
        announcePreview()
      })
    }
    if (page && pageJson !== lastPage) {
      lastPage = pageJson
      const motion = site ? getAt(site, 'theme.motion') !== false : true
      void previewPage(page, motion, docType).then((result) => {
        if (run !== seq || !result.ok || typeof result.value.html !== 'string') return
        const main = document.querySelector('main#content')
        if (!main) return
        const ran = scriptsOnPage()
        main.innerHTML = result.value.html
        runNewScripts(main, ran)
        announcePreview()
      })
    }
  })
  window.parent.postMessage({ type: DEVICE_READY }, location.origin)
}
