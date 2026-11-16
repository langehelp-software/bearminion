import { stepRadio } from '../shared.js'

/** Segmented control for a short list of exclusive choices. */
export function Segmented({
  label,
  value,
  options,
  onChange,
  hideLabel,
}: {
  label: string
  value: string
  /** `dot` draws a status dot before the label: `published` green, `draft` grey. */
  options: { value: string; label: string; dot?: 'published' | 'draft' }[]
  onChange: (value: string) => void
  hideLabel?: boolean
}) {
  const values = options.map((option) => option.value)
  return (
    <div class="bm-field">
      {!hideLabel && <span class="bm-label">{label}</span>}
      <div class="bm-segmented" role="radiogroup" aria-label={label} onKeyDown={(event) => stepRadio(event, values, value, onChange)}>
        {options.map((option) => (
          <button
            type="button"
            key={option.value}
            role="radio"
            aria-checked={value === option.value}
            tabIndex={value === option.value ? 0 : -1}
            onClick={() => onChange(option.value)}
          >
            {option.dot && <span class={`bm-seg-dot bm-seg-dot-${option.dot}`} aria-hidden="true" />}
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
