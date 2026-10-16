import { useState } from 'preact/hooks'
import type { MarkPatch, TextMark } from '../../marks.js'
import { Field } from './fields.js'

/** Name input plus style buttons. Select part of the name, then style it; the preview shows the result. */
export function WordmarkEditor({
  name,
  marks,
  onName,
  onMarks,
}: {
  name: string
  marks: unknown
  onName: (value: string) => void
  onMarks: (patch: MarkPatch, start: number, end: number) => void
}) {
  const [range, setRange] = useState({ start: 0, end: 0 })
  const start = Math.min(range.start, name.length)
  const end = Math.min(range.end, name.length)
  const hasRange = end > start
  const list = Array.isArray(marks) ? (marks as TextMark[]) : []
  const covering = hasRange ? list.find((mark) => mark.start <= start && mark.end >= end) : undefined
  const apply = (patch: MarkPatch) => (event: MouseEvent) => {
    event.preventDefault()
    if (hasRange) onMarks(patch, start, end)
  }
  return (
    <>
      <Field
        label="Name"
        path="name"
        value={name}
        onChange={onName}
        onSelectRange={(from, to) => setRange({ start: from, end: to })}
        hint="Select part of the name to style it."
      />
      <div class="bm-segmented bm-format" role="group" aria-label="Style selected text">
        <button
          type="button"
          disabled={!hasRange}
          aria-pressed={covering?.italic === true}
          onMouseDown={apply({ italic: covering?.italic !== true })}
        >
          <em>Italic</em>
        </button>
        <button
          type="button"
          disabled={!hasRange}
          aria-pressed={covering?.font === 'serif'}
          onMouseDown={apply({ font: covering?.font === 'serif' ? undefined : 'serif' })}
        >
          Serif
        </button>
        <button
          type="button"
          disabled={!hasRange}
          aria-pressed={covering?.font === 'mono'}
          onMouseDown={apply({ font: covering?.font === 'mono' ? undefined : 'mono' })}
        >
          Mono
        </button>
        <button type="button" disabled={!hasRange} onMouseDown={apply({ weight: undefined, italic: false, font: undefined })}>
          Clear
        </button>
      </div>
      <Wordmark name={name} marks={marks} />
    </>
  )
}

/** Name drawn the way the site draws it, from `nameMarks`. Display only. */
function Wordmark({ name, marks }: { name: string; marks: unknown }) {
  const list = Array.isArray(marks) ? (marks as TextMark[]) : []
  const cuts = new Set<number>([0, name.length])
  for (const mark of list) {
    cuts.add(Math.max(0, Math.min(name.length, mark.start)))
    cuts.add(Math.max(0, Math.min(name.length, mark.end)))
  }
  const points = [...cuts].sort((a, b) => a - b)
  const weights: Record<string, number> = { regular: 400, medium: 500, semibold: 600, bold: 700 }
  return (
    <div class="bm-wordmark" aria-hidden="true">
      <span class="bm-wordmark-name">
        {points.slice(0, -1).map((start, i) => {
          const end = points[i + 1] ?? name.length
          const active = list.filter((mark) => mark.start <= start && mark.end >= end)
          const font = active.find((mark) => mark.font)?.font
          const italic = active.some((mark) => mark.italic)
          const weight = active.find((mark) => mark.weight)?.weight
          const style = [
            font === 'serif' ? 'font-family:var(--serif)' : font === 'mono' ? 'font-family:var(--mono)' : '',
            italic ? 'font-style:italic' : '',
            weight ? `font-weight:${weights[weight] ?? 400}` : '',
          ]
            .filter(Boolean)
            .join(';')
          return (
            <span key={start} style={style || undefined}>
              {name.slice(start, end)}
            </span>
          )
        })}
      </span>
      <span class="bm-meta-tag">wordmark preview</span>
    </div>
  )
}
