import { useContext } from 'preact/hooks'
import { IssueContext } from '../context.js'
import { stepRadio } from '../shared.js'
import { FieldErrors, issuesFor } from './field-errors.js'
import { Segmented } from './segmented.js'

/** Up to this many choices show as a segmented control; more fall back to a select. */
export const SEGMENTED_MAX = 4

/** `split` → "Split", `top-left` → "Top left". Values such as `16:9` stay as they are. */
export function choiceLabel(value: string): string {
  const words = value.replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * One of a fixed list of values. With icons it is a grid of icon buttons; with up to four choices a segmented
 * control; otherwise a select. A value outside the list (old content) is kept and shown until a choice is made.
 */
export function ChoiceField({
  label,
  value,
  choices,
  icons,
  path,
  segmented = true,
  onChange,
}: {
  label: string
  value: string
  choices: readonly string[]
  icons?: Readonly<Record<string, string>>
  path?: string
  /** False keeps a select even for a short list, for side-by-side layouts. */
  segmented?: boolean
  onChange: (value: string) => void
}) {
  const issues = issuesFor(useContext(IssueContext), path)
  if (icons) {
    return (
      <div class="bm-field" data-editor-field={path}>
        <span class="bm-label-row bm-label">
          <span>{label}</span>
          <span class="bm-meta-tag">{choices.includes(value) ? choiceLabel(value) : value || 'none'}</span>
        </span>
        <div class="bm-icon-picker" role="radiogroup" aria-label={label} onKeyDown={(event) => stepRadio(event, choices, value, onChange)}>
          {choices.map((choice, index) => {
            const checked = value === choice
            const focusable = checked || (!choices.includes(value) && index === 0)
            return (
              <button
                type="button"
                key={choice}
                role="radio"
                aria-checked={checked}
                aria-label={choiceLabel(choice)}
                title={choiceLabel(choice)}
                tabIndex={focusable ? 0 : -1}
                onClick={() => onChange(choice)}
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d={icons[choice]} />
                </svg>
              </button>
            )
          })}
        </div>
        <FieldErrors issues={issues} />
      </div>
    )
  }
  if (segmented && choices.length <= SEGMENTED_MAX && choices.includes(value)) {
    return (
      <div class="bm-stack bm-stack-tight" data-editor-field={path}>
        <Segmented
          label={label}
          value={value}
          options={choices.map((choice) => ({ value: choice, label: choiceLabel(choice) }))}
          onChange={onChange}
        />
        <FieldErrors issues={issues} />
      </div>
    )
  }
  return (
    <label class="bm-label" data-editor-field={path}>
      {label}
      <select value={value} onChange={(event) => onChange(event.currentTarget.value)}>
        {!choices.includes(value) && <option value={value}>{value || 'Choose…'}</option>}
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {choiceLabel(choice)}
          </option>
        ))}
      </select>
      <FieldErrors issues={issues} />
    </label>
  )
}
