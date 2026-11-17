import { useEffect, useState } from 'preact/hooks'
import { showsPage } from '../shell.js'
import { attachEditor } from './controllers/index.js'
import { SectionConfirm, SessionDialogs } from './dialogs/editor-dialogs.js'
import { DraftBanner } from './overlay/banners.js'
import { HeadingFormatBar, RichTextBar } from './overlay/format-bars.js'
import { InsertGap } from './overlay/insert-gap.js'
import { LinkPopover } from './overlay/link-popover.js'
import { ImageBarOverlay, Outlines, PageImagePicker } from './overlay/outlines.js'
import { SectionBars } from './overlay/section-bars.js'
import { SectionPicker } from './overlay/section-picker.js'
import { Toaster } from './overlay/toaster.js'
import { Shell } from './shell/shell.js'
import { createEditor, EditorContext, useEditor } from './state/editor.js'

/** The editor overlay. Owns one editor instance for its lifetime and connects it to the page. */
export function EditorApp() {
  const [editor] = useState(createEditor)
  useEffect(() => attachEditor(editor), [editor])
  return (
    <EditorContext.Provider value={editor}>
      <EditorView />
    </EditorContext.Provider>
  )
}

/** Outlines and bars drawn over the page are clipped to the canvas, so they never paint over the shell. */
function CanvasLayer() {
  const { layout } = useEditor()
  const { area, viewportWidth } = layout.metrics.value
  const clip = `clip-path:inset(${area.top}px ${Math.max(0, viewportWidth - area.right)}px 0 ${area.left}px);`
  return (
    <div class="bm-canvas-layer" style={clip}>
      <Outlines />
      <InsertGap />
      <ImageBarOverlay />
      <SectionBars />
    </div>
  )
}

/** Order matters: later elements paint over earlier ones, and the active section bar must be the first toolbar. */
function EditorView() {
  const { doc, ui } = useEditor()
  const editing = !ui.previewing.value && showsPage(ui.view.value) && ui.viewport.value === 'desktop'
  return (
    <>
      {editing && (
        <>
          <CanvasLayer />
          <SectionPicker />
          <RichTextBar />
          <HeadingFormatBar />
          <LinkPopover />
          <PageImagePicker />
          <SectionConfirm />
        </>
      )}
      <Shell catalog={doc.catalog.value} />
      <DraftBanner />
      <SessionDialogs />
      <Toaster />
    </>
  )
}
