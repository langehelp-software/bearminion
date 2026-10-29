import { handleEditorRequest } from '../api.js'
import { API_PREFIX } from '../model.js'
import type { EditorContext } from '../options.js'

export interface ApiResult {
  status: number
  ok: boolean
  body: unknown
}

/**
 * Calls the editor's own routes in this process, with no server and no socket. The MCP tools go through the same
 * handlers as the editor, so every write is migrated and schema-checked there, and a rename, a new home page or a
 * deleted page behaves as it does in the editor. There is no second write path.
 */
export async function callEditorApi(
  context: EditorContext,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<ApiResult> {
  const form = body instanceof FormData
  const response = await handleEditorRequest(
    new Request(`http://localhost${API_PREFIX}${path}`, {
      method,
      // A form body sets its own content type, with the multipart boundary.
      headers: { host: 'localhost', origin: 'http://localhost', ...(form ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: form ? (body as FormData) : JSON.stringify(body) }),
    }),
    context,
  )
  if (response === null) throw new Error(`The editor has no route for ${method} ${path}.`)
  const text = await response.text()
  let parsed: unknown = text
  try {
    parsed = text === '' ? null : JSON.parse(text)
  } catch {
    // A non-JSON body is passed on as text.
  }
  return { status: response.status, ok: response.ok, body: parsed }
}
