import { HONEYPOT_FIELD as SERVER_HONEYPOT, TURNSTILE_FIELD as SERVER_TURNSTILE } from '../../packages/editor/src/form-contract'
import { describe, expect, it } from 'vitest'
import {
  HONEYPOT_FIELD,
  TURNSTILE_FIELD,
  MIN_FILL_MS,
  botVerdict,
  FORM_ENDPOINT,
  buildRequest,
  collectSubmission,
  readResponse,
} from '../../templates/default/src/lib/contact-form'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { hasFormHandler, unhandledFormMessage, unhandledForms } from '../../templates/default/src/lib/form-check'
import { contactSchema } from '../../templates/default/src/components/sections/contact/definition'

describe('contact form submission', () => {
  const entries: Array<[string, unknown]> = [
    ['name', 'Ada'],
    ['email', 'ada@example.com'],
    ['topic', 'General'],
    ['message', 'Hello'],
    [HONEYPOT_FIELD, ''],
    ['attachment', new Blob(['x'])],
  ]

  it('collects the fields as strings with the form id and page, leaving out the trap and files', () => {
    expect(collectSubmission(entries, 'contact', '/contact')).toEqual({
      formId: 'contact',
      page: '/contact',
      name: 'Ada',
      email: 'ada@example.com',
      topic: 'General',
      message: 'Hello',
    })
  })

  it('does not let a field named formId or page overwrite where the form came from', () => {
    const submission = collectSubmission([...entries, ['formId', 'spoofed'], ['page', '/elsewhere']], 'contact', '/contact')
    expect(submission.formId).toBe('contact')
    expect(submission.page).toBe('/contact')
  })

  it('posts the submission as JSON to /api/contact, asking for JSON back', () => {
    const submission = collectSubmission(entries, 'contact', '/contact')
    const request = buildRequest(submission)
    expect(FORM_ENDPOINT).toBe('/api/contact')
    expect(request.url).toBe('/api/contact')
    expect(request.init.method).toBe('POST')
    expect(request.init.headers).toEqual({ Accept: 'application/json', 'Content-Type': 'application/json' })
    expect(JSON.parse(String(request.init.body))).toEqual(submission)
  })
})

describe('field names shared with the server', () => {
  it('match what defineForm in bearminion/forms looks for', () => {
    expect(HONEYPOT_FIELD).toBe(SERVER_HONEYPOT)
    expect(TURNSTILE_FIELD).toBe(SERVER_TURNSTILE)
  })
})

describe('spam checks', () => {
  it('drops a filled trap and a submit that came too soon, and lets a person through', () => {
    expect(botVerdict('http://spam.example', 0, 60_000)).toBe('honeypot')
    expect(botVerdict('   ', 0, 60_000)).toBeNull()
    expect(botVerdict('', 1_000, 1_000 + MIN_FILL_MS - 1)).toBe('too-fast')
    expect(botVerdict('', 1_000, 1_000 + MIN_FILL_MS)).toBeNull()
  })
})

describe('reading the handler answer', () => {
  it('treats a 2xx as sent, with or without a body, and obeys ok:false', () => {
    expect(readResponse(200, { ok: true })).toEqual({ ok: true })
    expect(readResponse(200, undefined)).toEqual({ ok: true })
    expect(readResponse(204, undefined)).toEqual({ ok: true })
    expect(readResponse(200, { ok: false, error: 'Rejected.' })).toEqual({ ok: false, error: 'Rejected.' })
  })

  it('takes a success message only from an answer that says ok: true', () => {
    expect(readResponse(200, { ok: true, message: '  We will write back today.  ' })).toEqual({
      ok: true,
      message: 'We will write back today.',
    })
    expect(readResponse(200, { ok: true, message: '   ' })).toEqual({ ok: true })
    expect(readResponse(200, { message: 'Something else answered.' })).toEqual({ ok: true })
  })

  it('reads field errors', () => {
    expect(readResponse(422, { ok: false, error: 'Check the form.', fieldErrors: { email: 'Not an address.' } })).toEqual({
      ok: false,
      error: 'Check the form.',
      fieldErrors: { email: 'Not an address.' },
    })
  })

  it('falls back to a plain message by status, and a refused 2xx gets the generic one', () => {
    expect(readResponse(500, undefined)).toEqual({ ok: false, error: 'The server had a problem. Try again in a moment.' })
    expect(readResponse(404, undefined)).toMatchObject({ ok: false, error: expect.stringContaining('not accepted') })
    expect(readResponse(429, undefined)).toMatchObject({ ok: false, error: expect.stringContaining('Too many') })
    expect(readResponse(400, 'not json')).toMatchObject({ ok: false, error: expect.stringContaining('not accepted') })
    expect(readResponse(200, { ok: false })).toMatchObject({ ok: false, error: expect.stringContaining('not accepted') })
  })

  it('ignores empty or non-string messages', () => {
    expect(readResponse(400, { error: '  ', message: 5, fieldErrors: { email: '', name: 3 } })).toMatchObject({ ok: false })
    expect(readResponse(400, { error: '  ', fieldErrors: { email: '' } })).not.toHaveProperty('fieldErrors')
  })
})

describe('the Contact schema', () => {
  const base = { details: [], topics: [] }

  it('keeps no form settings: the form posts to /api/contact and its keys live in the environment', () => {
    expect(contactSchema.safeParse(base).success).toBe(true)
    for (const key of ['action', 'turnstile', 'format']) {
      expect(contactSchema.safeParse({ ...base, [key]: 'x' }).success, key).toBe(false)
    }
  })
})

describe('warning for a form with no handler', () => {
  const pages = [
    {
      slug: 'index',
      sections: [
        { id: 'hero', type: 'hero' },
        { id: 'contact', type: 'contact' },
      ],
    },
    { slug: 'help', sections: [{ id: 'ask', type: 'contact' }] },
    { slug: 'about', sections: [{ id: 'hero', type: 'hero' }] },
  ]

  it('lists every contact section while there is no handler, and nothing once there is one', () => {
    expect(unhandledForms(pages, false)).toEqual([
      { page: 'index', section: 'contact' },
      { page: 'help', section: 'ask' },
    ])
    expect(unhandledForms(pages, true)).toEqual([])
    expect(unhandledFormMessage({ page: 'index', section: 'contact' })).toContain('src/forms/contact.ts')
    expect(unhandledFormMessage({ page: 'index', section: 'contact' })).toContain('docs.bearminion.com/forms')
  })

  it('finds the handler file with any of the four extensions', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-forms-'))
    try {
      expect(hasFormHandler(dir)).toBe(false)
      for (const extension of ['.ts', '.mts', '.js', '.mjs']) {
        const file = path.join(dir, `contact${extension}`)
        fs.writeFileSync(file, '')
        expect(hasFormHandler(dir), extension).toBe(true)
        fs.rmSync(file)
      }
      fs.writeFileSync(path.join(dir, 'other.ts'), '')
      expect(hasFormHandler(dir)).toBe(false)
      expect(hasFormHandler(dir, 'other')).toBe(true)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
