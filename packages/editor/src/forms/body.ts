/**
 * Reading a form post: the bytes with a size cap, then the fields as strings. Web-standard APIs only, so it runs on
 * Node, Vercel, Netlify and Cloudflare alike.
 */

/** A post larger than this is refused. A contact message is a few hundred bytes. */
export const DEFAULT_MAX_BYTES = 64 * 1024

/** A post that cannot be used, with the HTTP status that says why. */
export class BodyError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'BodyError'
    this.status = status
  }
}

/** The request body, or a 413 as soon as it is known to be over `maxBytes`. */
export async function readBody(request: Request, maxBytes: number): Promise<Uint8Array<ArrayBuffer>> {
  const advertised = Number(request.headers.get('content-length') ?? '')
  if (Number.isFinite(advertised) && advertised > maxBytes) throw new BodyError(413, 'The message is too large.')
  const reader = request.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw new BodyError(413, 'The message is too large.')
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The text fields of a post: JSON, `multipart/form-data` or `application/x-www-form-urlencoded`. Anything that is not
 * text (a file, a number, a nested object) is left out, so a handler only ever sees strings.
 */
export async function parseFields(contentType: string | null, bytes: Uint8Array<ArrayBuffer>): Promise<Record<string, string>> {
  const type = (contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
  const fields: Record<string, string> = {}
  const add = (name: string, value: unknown) => {
    if (name === '__proto__' || typeof value !== 'string') return
    fields[name] = value
  }
  if (type === 'application/json') {
    let parsed: unknown
    try {
      parsed = JSON.parse(new TextDecoder().decode(bytes))
    } catch {
      throw new BodyError(400, 'The message could not be read.')
    }
    if (!isRecord(parsed)) throw new BodyError(400, 'The message could not be read.')
    for (const [name, value] of Object.entries(parsed)) add(name, value)
    return fields
  }
  if (type === 'multipart/form-data' || type === 'application/x-www-form-urlencoded') {
    let data: FormData
    try {
      data = await new Response(bytes, { headers: { 'content-type': contentType ?? type } }).formData()
    } catch {
      throw new BodyError(400, 'The message could not be read.')
    }
    for (const [name, value] of data.entries()) add(name, value)
    return fields
  }
  throw new BodyError(415, 'Send the form as JSON or as form data.')
}
