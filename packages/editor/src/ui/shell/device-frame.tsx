import { effect } from '@preact/signals'
import { useEffect, useRef } from 'preact/hooks'
import { DEVICE_WIDTHS, type Viewport } from '../../shell.js'
import { DEVICE_FRAME_ATTR, DEVICE_READY, type DeviceDraft } from '../device-mirror.js'
import { pruneDraft } from '../state/document.js'
import { useEditor } from '../state/editor.js'

const SEND_DEBOUNCE_MS = 200

/**
 * The page at a tablet or phone width: the same address in an `<iframe>`, so the site's media queries apply, showing
 * the unsaved draft. Editing happens on the desktop canvas; this frame is for looking.
 */
export function DeviceFrame({ viewport }: { viewport: Exclude<Viewport, 'desktop'> }) {
  const { doc } = useEditor()
  const frame = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    let timer: number | null = null
    const send = () => {
      const target = frame.current?.contentWindow
      if (!target) return
      const page = doc.page.peek()
      const { type, kind } = doc.ref.peek()
      const message: DeviceDraft = {
        type: 'bearminion:device-draft',
        page: page ? pruneDraft(page, doc.catalog.peek()?.optionalContent) : null,
        site: doc.site.peek(),
        ...(kind === 'listing' ? {} : { docType: type }),
      }
      target.postMessage(message, location.origin)
    }
    const onMessage = (event: MessageEvent<{ type?: string }>) => {
      if (event.origin === location.origin && event.source === frame.current?.contentWindow && event.data?.type === DEVICE_READY) send()
    }
    window.addEventListener('message', onMessage)
    const stop = effect(() => {
      doc.page.value
      doc.site.value
      if (timer !== null) window.clearTimeout(timer)
      timer = window.setTimeout(send, SEND_DEBOUNCE_MS)
    })
    return () => {
      stop()
      if (timer !== null) window.clearTimeout(timer)
      window.removeEventListener('message', onMessage)
    }
  }, [])

  const width = DEVICE_WIDTHS[viewport]
  return (
    <section class="bm-device bm-chrome" aria-label={`${viewport === 'tablet' ? 'Tablet' : 'Mobile'} preview`}>
      <iframe
        ref={frame}
        class="bm-device-frame"
        title={`This page at ${width}px`}
        src={location.href}
        style={`width:${width}px;`}
        {...{ [DEVICE_FRAME_ATTR]: '' }}
      />
      <p class="bm-device-note">{width}px preview of the unsaved draft. Switch to Desktop to edit on the page.</p>
    </section>
  )
}
