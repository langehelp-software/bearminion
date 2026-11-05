import { describe, expect, it } from 'vitest'
import { DEFAULT_PAGE_RULES, resolvePageRules } from '../src/page.js'

describe('resolvePageRules', () => {
  it('allows everything by default', () => {
    expect(resolvePageRules(undefined)).toEqual({ rename: true, delete: true })
    expect(DEFAULT_PAGE_RULES).toEqual({ rename: true, delete: true })
    expect(resolvePageRules({})).toEqual({ rename: true, delete: true })
  })

  it('locks one operation at a time', () => {
    expect(resolvePageRules({ rename: false })).toEqual({ rename: false, delete: true })
    expect(resolvePageRules({ delete: false })).toEqual({ rename: true, delete: false })
  })

  it('refuses a misspelt option or a value that is not a boolean, so a typo cannot leave a site unlocked', () => {
    expect(() => resolvePageRules({ renames: false } as never)).toThrow(/pages\.renames/)
    expect(() => resolvePageRules({ rename: 'no' } as never)).toThrow(/pages\.rename must be true or false/)
  })
})
