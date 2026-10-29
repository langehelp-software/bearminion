export const currencyPositions = ['prefix', 'suffix'] as const
export type CurrencyPosition = (typeof currencyPositions)[number]

const NO_BREAK_SPACE = ' '

/**
 * A price with its currency: `$9`, `9 zł`, `CHF 9`. A suffix is set off by a no-break space, so the number and the
 * currency never split across lines. A prefix that ends in a letter, such as a currency code, gets one too.
 */
export function formatPrice(amount: number, currency: string, position: CurrencyPosition = 'prefix'): string {
  if (position === 'suffix') return `${amount}${NO_BREAK_SPACE}${currency}`
  return /\p{L}$/u.test(currency) ? `${currency}${NO_BREAK_SPACE}${amount}` : `${currency}${amount}`
}
