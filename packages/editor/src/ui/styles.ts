import editorCss from './editor.css?raw'

/** The overlay's stylesheet, inlined into its shadow root. */
export { editorCss }

export function boxStyle(rect: DOMRect, offset = 0): string {
  return `top:${rect.top - offset}px;left:${rect.left - offset}px;width:${rect.width + offset * 2}px;height:${rect.height + offset * 2}px;`
}
