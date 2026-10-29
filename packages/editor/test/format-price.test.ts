import { describe, expect, it } from 'vitest'
import { formatPrice } from '../../../templates/default/src/lib/format-price'
import { sectionRegistry } from './starter.js'

describe('formatPrice', () => {
  it('puts a symbol before the number with no space', () => {
    expect(formatPrice(9, '$')).toBe('$9')
    expect(formatPrice(0, '€', 'prefix')).toBe('€0')
  })

  it('puts a suffix after the number, with a no-break space', () => {
    expect(formatPrice(49, 'zł', 'suffix')).toBe('49 zł')
  })

  it('sets a prefix that ends in a letter off from the number', () => {
    expect(formatPrice(9, 'CHF')).toBe('CHF 9')
  })
})

describe('pricing currency', () => {
  const schema = sectionRegistry.pricing.schema
  const base = sectionRegistry.pricing.defaults as Record<string, unknown>

  it('defaults to $ before the price, so files written before it still parse', () => {
    const { currency, currencyPosition, ...old } = base
    expect(currency).toBe('$')
    expect(currencyPosition).toBe('prefix')
    expect(schema.parse(old)).toMatchObject({ currency: '$', currencyPosition: 'prefix' })
  })

  it('accepts a suffix currency and rejects an unknown position or an empty currency', () => {
    expect(schema.safeParse({ ...base, currency: 'zł', currencyPosition: 'suffix' }).success).toBe(true)
    expect(schema.safeParse({ ...base, currencyPosition: 'middle' }).success).toBe(false)
    expect(schema.safeParse({ ...base, currency: ' ' }).success).toBe(false)
  })
})
