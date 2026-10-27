import { describe, expect, it } from 'vitest'
import { contact } from '../../templates/default/src/components/sections/contact/definition'
import { HIDDEN_FALLBACK, hide, reveal } from '../../templates/default/src/lib/hidden-text'

describe('hidden contact details', () => {
  it('round-trips an email address, a phone number and non-ASCII text', () => {
    for (const value of ['hello@example.com', '+48 600 100 200', 'zażółć@gęślą.pl', '', 'a']) {
      expect(reveal(hide(value))).toBe(value)
    }
  })

  it('leaves nothing a harvester looks for in the HTML', () => {
    for (const value of ['hello@example.com', '+48 600 100 200', '600100200']) {
      const hidden = hide(value)
      expect(hidden).toMatch(/^[A-Za-z0-9_-]*$/)
      expect(hidden).not.toContain('@')
      expect(hidden).not.toContain(value)
      expect(hidden.replace(/\D/g, '')).not.toContain('600')
    }
  })

  it('tells a visitor without JavaScript what to do', () => {
    expect(HIDDEN_FALLBACK).toContain('JavaScript')
    expect(HIDDEN_FALLBACK).not.toMatch(/@|\d{3}/)
  })

  it('is a switch each detail can set, off unless it is, and the editor lists it for details that lack it', () => {
    const schema = contact.schema
    const base = { details: [{ label: 'Email', value: 'a@b.co' }], topics: [] }
    expect(schema.safeParse(base).success).toBe(true)
    expect(schema.safeParse({ ...base, details: [{ label: 'Email', value: 'a@b.co', hideFromCrawlers: true }] }).success).toBe(true)
    expect(schema.safeParse({ ...base, details: [{ label: 'Email', value: 'a@b.co', hideFromCrawlers: 'yes' }] }).success).toBe(false)
    expect(contact.optional.items?.details).toEqual(['hideFromCrawlers'])
    expect(contact.defaults.details[0]).toMatchObject({ hideFromCrawlers: false })
  })
})
