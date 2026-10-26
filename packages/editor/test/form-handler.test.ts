// @vitest-environment happy-dom
import { h, render } from 'preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FormHandlerNote, describeHandler } from '../src/ui/forms/form-handler.js'

describe('describeHandler', () => {
  it('warns that nothing receives the form while the file is missing', () => {
    const note = describeHandler('contact', null)
    expect(note.tone).toBe('warn')
    expect(note.text).toContain('src/forms/contact.ts')
  })

  it('says the handler is custom code BearMinion cannot check, and to test it by hand', () => {
    const note = describeHandler('contact', 'src/forms/contact.ts')
    expect(note.tone).toBe('hint')
    expect(note.text).toContain('/api/contact')
    expect(note.text).toContain('src/forms/contact.ts')
    expect(note.text).toContain('cannot check')
    expect(note.text).toContain('test message')
  })
})

describe('FormHandlerNote', () => {
  let container: HTMLElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.append(container)
  })

  afterEach(() => {
    render(null, container)
    container.remove()
    vi.unstubAllGlobals()
  })

  const answer = (body: unknown, status = 200) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })),
    )
  const settle = () => new Promise((resolve) => setTimeout(resolve, 50))

  it('shows the custom-handler note when the file exists', async () => {
    answer({ enabled: true, handlers: { contact: { file: 'src/forms/contact.ts' } } })
    render(h(FormHandlerNote, { name: 'contact' }), container)
    await settle()
    const note = container.querySelector('[data-form-handler="contact"]')
    expect(note?.className).toBe('bm-hint')
    expect(note?.textContent).toContain('cannot check')
  })

  it('shows a warning when the file is missing', async () => {
    answer({ enabled: true, handlers: { contact: { file: null } } })
    render(h(FormHandlerNote, { name: 'contact' }), container)
    await settle()
    const note = container.querySelector('[data-form-handler="contact"]')
    expect(note?.className).toBe('bm-error')
    expect(note?.getAttribute('role')).toBe('alert')
  })

  it('shows nothing when forms are off or the server did not answer', async () => {
    answer({ enabled: false, handlers: {} })
    render(h(FormHandlerNote, { name: 'contact' }), container)
    await settle()
    expect(container.querySelector('[data-form-handler]')).toBeNull()

    render(null, container)
    answer({ message: 'nope' }, 500)
    render(h(FormHandlerNote, { name: 'contact' }), container)
    await settle()
    expect(container.querySelector('[data-form-handler]')).toBeNull()
  })
})
