import { useEffect, useState } from 'preact/hooks'
import { attachEditor } from './controllers/index.js'
import { SectionConfirm, SessionDialogs } from './dialogs/editor-dialogs.js'
import { DraftBanner, TabNotice } from './overlay/banners.js'
import { HeadingFormatBar, RichTextBar } from './overlay/format-bars.js'
import { InsertGap } from './overlay/insert-gap.js'
import { LinkPopover } from './overlay/link-popover.js'
import { ImageBarOverlay, Outlines, PageImagePicker } from './overlay/outlines.js'
import { SectionBars } from './overlay/section-bars.js'
import { SectionPicker } from './overlay/section-picker.js'
import { Dock, ExitPreviewButton } from './sidebar/editor-controls.js'
import { Sidebar } from './sidebar/sidebar.js'
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

/** Order matters: later elements paint over earlier ones, and the active section bar must be the first toolbar. */
function EditorView() {
  const { doc, ui } = useEditor()
  if (ui.previewing.value) return <ExitPreviewButton />
  const catalog = doc.catalog.value
  return (
    <>
      <Outlines />
      <InsertGap />
      <ImageBarOverlay />
      <SectionBars />
      <SectionPicker />
      <RichTextBar />
      <HeadingFormatBar />
      <LinkPopover />
      <PageImagePicker />
      <SectionConfirm />
      <DraftBanner />
      <TabNotice />
      <SessionDialogs />
      {ui.open.value ? catalog && <Sidebar catalog={catalog} /> : <Dock />}
    </>
  )
}
