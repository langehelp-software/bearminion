import { describe, expect, it } from 'vitest'
import { createToasts } from '../src/ui/state/toasts.js'
import { createUiState, SAVE_TOAST } from '../src/ui/state/ui.js'

describe('toasts', () => {
  it('stacks newest last and stays until dismissed', () => {
    const toasts = createToasts()
    const first = toasts.error('One')
    toasts.warning('Two')
    expect(toasts.list.value.map((toast) => toast.title)).toEqual(['One', 'Two'])
    toasts.dismiss(first)
    expect(toasts.list.value.map((toast) => toast.title)).toEqual(['Two'])
    toasts.clear()
    expect(toasts.list.value).toEqual([])
  })

  it('replaces a toast with the same key instead of piling up copies', () => {
    const toasts = createToasts()
    toasts.error('Save failed', { key: 'save' })
    toasts.info('Other')
    toasts.error('Save failed again', { key: 'save', lines: ['a: b'] })
    expect(toasts.list.value.map((toast) => toast.title)).toEqual(['Other', 'Save failed again'])
    toasts.dismissKey('save')
    expect(toasts.list.value.map((toast) => toast.title)).toEqual(['Other'])
  })

  it('caps the stack so a failure loop cannot grow it without bound', () => {
    const toasts = createToasts()
    for (let index = 0; index < 30; index += 1) toasts.error(`E${index}`)
    expect(toasts.list.value).toHaveLength(12)
    expect(toasts.list.value.at(-1)?.title).toBe('E29')
  })

  it('shows a failed save as one toast listing every issue', () => {
    const ui = createUiState()
    ui.fail('Save failed validation.', [{ file: 'page', path: 'sections.0.props.image', message: 'expected object' }])
    ui.fail('Save failed validation.', [{ path: 'slug', message: 'taken' }])
    expect(ui.toasts.list.value).toEqual([
      expect.objectContaining({
        tone: 'error',
        key: SAVE_TOAST,
        title: 'Save failed validation. Nothing was written.',
        lines: ['slug: taken'],
      }),
    ])
    expect(ui.issues.value).toEqual([{ path: 'slug', message: 'taken' }])
  })
})
