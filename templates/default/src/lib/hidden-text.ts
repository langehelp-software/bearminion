/**
 * Keeps a contact detail (an email address, a phone number) out of the page's HTML, so a crawler that only reads markup
 * does not harvest it. `hide` runs at build time and `reveal` in the browser.
 *
 * This is obfuscation, not encryption: the page has to show the value, so a browser, and any crawler that runs the
 * page's script, can recover it. It stops the scrapers that match `@` and digits in the HTML, which is most of them.
 */

const KEY = 'bearminion'

function scramble(bytes: Uint8Array): Uint8Array {
  return bytes.map((byte, index) => byte ^ (KEY.charCodeAt(index % KEY.length) & 0xff))
}

/** `value` as a short ASCII string that contains none of its characters. */
export function hide(value: string): string {
  const scrambled = scramble(new TextEncoder().encode(value))
  let binary = ''
  for (const byte of scrambled) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** The value `hide` was given. */
export function reveal(hidden: string): string {
  const base64 = hidden.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new TextDecoder().decode(scramble(bytes))
}

/** What a visitor without JavaScript reads where the value would be. */
export const HIDDEN_FALLBACK = 'Turn on JavaScript to see this, or use the form.'
