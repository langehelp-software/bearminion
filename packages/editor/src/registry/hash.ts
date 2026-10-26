import { createHash } from 'node:crypto'

const TEXT_FILE = /\.(?:astro|ts|mts|js|mjs|json|css|md|svg|html)$/

/**
 * The hash of a file's content, as hex. Text files hash with `\r\n` read as `\n`, so a Windows checkout with
 * autocrlf and a Unix one agree.
 */
export function hashContent(file: string, content: Uint8Array | string): string {
  const hash = createHash('sha256')
  if (TEXT_FILE.test(file)) {
    const text = typeof content === 'string' ? content : Buffer.from(content).toString('utf8')
    hash.update(text.replace(/\r\n/g, '\n'))
  } else {
    hash.update(typeof content === 'string' ? content : Buffer.from(content))
  }
  return hash.digest('hex')
}
