import { type FontMark, fontMarks, type MarkPatch } from '../../marks.js'
import { defaultTheme, type ThemeDefinition } from '../../theme.js'
import { marksAt } from '../dom.js'
import { Icon } from '../icons.js'
import type { RichCommand } from '../rich-editor.js'
import { isPagePath } from '../state/document.js'
import { type Editor, useEditor } from '../state/editor.js'

/** Heading format bar: each button shows "Aa" in its own weight or font over a mono caption. */
const HEADING_WEIGHTS = [
  { value: 'regular', label: 'Regular weight', weight: 400 },
  { value: 'medium', label: 'Medium weight', weight: 500 },
  { value: 'semibold', label: 'Semibold weight', weight: 600 },
  { value: 'bold', label: 'Bold weight', weight: 700 },
] as const

/**
 * The heading format bar's font buttons, from the theme (`defineTheme`). The accessible name is the theme's label;
 * the first family in the stack goes in the title, and the sample is drawn in the whole stack.
 */
function headingFonts(theme: ThemeDefinition | undefined): { value: FontMark; label: string; family: string; face: string }[] {
  const fonts = theme?.fonts ?? defaultTheme.fonts
  return fontMarks.map((value) => {
    const font = fonts[value] ?? defaultTheme.fonts[value]
    return { value, label: font.label, family: font.family.split(',')[0]?.replace(/["']/g, '').trim() ?? font.family, face: font.family }
  })
}

/** Run a formatting command on the rich field being edited. The field's editor writes the draft on each change. */
function formatRich({ ui, richTarget }: Editor, event: MouseEvent, command: RichCommand) {
  event.preventDefault()
  richTarget.current?.run(command, command === 'link' ? ui.linkUrl.peek().trim() : undefined)
}

/** Bold, italic, code, lists and links for the rich-text field being edited. */
export function RichTextBar() {
  const editor = useEditor()
  const { ui } = editor
  const position = ui.rich.value
  if (!position) return null
  const active = ui.richActive.value
  const run = (command: RichCommand) => (event: MouseEvent) => formatRich(editor, event, command)
  return (
    <div class="bm-rich" style={`top:${position.top}px;left:${position.left}px;`}>
      {active?.headings && (
        <>
          <button
            type="button"
            class="bm-fmt-heading"
            aria-label="Heading"
            title="Heading"
            aria-pressed={active.heading === 2}
            onMouseDown={run('heading2')}
          >
            H2
          </button>
          <button
            type="button"
            class="bm-fmt-heading"
            aria-label="Subheading"
            title="Subheading"
            aria-pressed={active.heading === 3}
            onMouseDown={run('heading3')}
          >
            H3
          </button>
          <span class="bm-sep" aria-hidden="true" />
        </>
      )}
      <button
        type="button"
        class="bm-fmt-bold"
        aria-label="Bold"
        title="Bold"
        aria-pressed={active?.bold === true}
        onMouseDown={run('bold')}
      >
        B
      </button>
      <button
        type="button"
        class="bm-fmt-italic"
        aria-label="Italic"
        title="Italic"
        aria-pressed={active?.italic === true}
        onMouseDown={run('italic')}
      >
        I
      </button>
      <button
        type="button"
        class="bm-fmt-code"
        aria-label="Code"
        title="Code"
        aria-pressed={active?.code === true}
        onMouseDown={run('code')}
      >
        {'</>'}
      </button>
      <button
        type="button"
        aria-label="Bulleted list"
        title="Bulleted list"
        aria-pressed={active?.bulletList === true}
        onMouseDown={run('bulletList')}
      >
        <Icon name="list" size={14} />
      </button>
      <button
        type="button"
        aria-label="Numbered list"
        title="Numbered list"
        aria-pressed={active?.orderedList === true}
        onMouseDown={run('orderedList')}
      >
        <Icon name="list-ordered" size={14} />
      </button>
      <span class="bm-sep" aria-hidden="true" />
      <input
        aria-label="Link URL"
        value={ui.linkUrl.value}
        onInput={(event) => {
          ui.linkUrl.value = event.currentTarget.value
        }}
      />
      <button type="button" aria-label="Link" title="Link" aria-pressed={active?.link === true} onMouseDown={run('link')}>
        <Icon name="link" size={14} />
      </button>
    </div>
  )
}

/** Weight and font for the selected part of a heading. */
export function HeadingFormatBar() {
  const { doc, ui, edits } = useEditor()
  const bar = ui.headingBar.value
  if (!bar) return null
  const source = isPagePath(bar.path) ? doc.page.value : doc.site.value
  // The mark that covers the selected heading text, so the bar can show what is on.
  const mark = marksAt(source, bar.path)?.find((item) => item.start <= bar.start && item.end >= bar.end) ?? null
  const apply = (patch: MarkPatch) => (event: MouseEvent) => {
    event.preventDefault()
    edits.applyMarksAt(bar.path, patch, bar.start, bar.end)
  }
  return (
    <div class="bm-rich bm-format-bar" role="toolbar" aria-label="Heading format" style={`top:${bar.top}px;left:${bar.left}px;`}>
      {HEADING_WEIGHTS.map(({ value, label, weight }) => (
        <button
          type="button"
          key={value}
          class="bm-fmt"
          aria-label={label}
          title={label}
          aria-pressed={mark?.weight === value}
          onMouseDown={apply({ weight: value })}
        >
          <span class="bm-fmt-sample" style={`font-weight:${weight}`} aria-hidden="true">
            Aa
          </span>
          <span class="bm-fmt-caption" aria-hidden="true">
            {weight}
          </span>
        </button>
      ))}
      <span class="bm-sep" aria-hidden="true" />
      {headingFonts(doc.catalog.value?.theme).map(({ value, label, family, face }) => (
        <button
          type="button"
          key={value}
          class="bm-fmt"
          aria-label={label}
          title={`${label} · ${family}`}
          aria-pressed={mark?.font === value}
          onMouseDown={apply({ font: mark?.font === value ? undefined : value })}
        >
          <span class="bm-fmt-sample" style={`font-family:${face}`} aria-hidden="true">
            Aa
          </span>
          <span class="bm-fmt-caption" aria-hidden="true">
            {label}
          </span>
        </button>
      ))}
    </div>
  )
}
