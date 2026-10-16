import { render } from 'preact'
import { EditorApp } from './app.js'
import { EDITOR_HOST_ID } from './dom.js'
import { editorCss } from './styles.js'

/** Mount the overlay once. The host does not take clicks; controls inside the shadow root do. */
export function mountEditor(): void {
  if (document.getElementById(EDITOR_HOST_ID)) return
  const host = document.createElement('div')
  host.id = EDITOR_HOST_ID
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483000;pointer-events:none;'
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = editorCss
  const root = document.createElement('div')
  shadow.append(style, root)
  document.body.append(host)
  // The overlay draws one rectangle around the hovered field. A native focus ring on an inline field that wraps
  // lines follows each line box instead, which gives a second, stepped outline.
  const page = document.createElement('style')
  page.id = 'bearminion-editor-page'
  // A rich field is a ProseMirror view while edited. Its markup matches the page's (<p>s and lists), except that a
  // list item holds a <p>, which drops its margin; the view also gets the base rules ProseMirror needs.
  page.textContent = [
    '[data-field][contenteditable]:focus, [data-field][contenteditable]:focus-visible { outline: none !important; }',
    '[data-field].ProseMirror { white-space: break-spaces; word-wrap: break-word; font-variant-ligatures: none; }',
    '[data-field].ProseMirror li > p { margin: 0; }',
  ].join('\n')
  document.head.append(page)
  render(<EditorApp />, root)
}
