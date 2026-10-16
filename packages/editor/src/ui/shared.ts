export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function stepRadio(event: KeyboardEvent, values: readonly string[], value: string, onChange: (value: string) => void) {
  const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
  if (step === 0) return
  event.preventDefault()
  const current = Math.max(0, values.indexOf(value))
  const next = values[(current + step + values.length) % values.length]
  if (next === undefined) return
  onChange(next)
  const group = event.currentTarget
  if (group instanceof HTMLElement) {
    queueMicrotask(() => group.querySelector<HTMLElement>('[aria-checked="true"]')?.focus())
  }
}

export function isLinkRecord(
  value: unknown,
): value is { label: string; href: string; newTab?: boolean; id?: string; trackingId?: string; style?: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'label' in value &&
    'href' in value &&
    typeof value.label === 'string' &&
    typeof value.href === 'string'
  )
}

export function isImageRecord(value: unknown): value is { src: string; alt?: string } {
  return typeof value === 'object' && value !== null && 'src' in value && 'alt' in value
}

export function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
