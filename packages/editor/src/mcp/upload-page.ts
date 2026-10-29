import { randomBytes } from 'node:crypto'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { Readable } from 'node:stream'
import type { EditorContext } from '../options.js'
import { IMAGE_BYTE_LIMIT, MULTIPART_BODY_LIMIT } from '../security.js'
import { callEditorApi } from './adapter.js'

const DEFAULT_TTL_MS = 15 * 60_000
const TOKEN_PATH = /^\/upload\/([0-9a-f]{32})$/
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/avif'

type Slot = { state: 'waiting'; expires: number } | { state: 'busy'; expires: number } | { state: 'done'; expires: number; upload: unknown }

export type CheckOutcome = { status: 'done'; upload: unknown } | { status: 'waiting' } | { status: 'expired' }

/**
 * A browser upload for the assistant: the person opens a one-time link, picks an image with an ordinary file input
 * and the page posts it here. The file goes straight to the editor's own image route, so it gets the same content
 * check and size limit as an upload in the editor, and it never passes through the assistant.
 *
 * The listener is created on the first request, binds to 127.0.0.1 only and lives as long as the MCP server. A link
 * works for one successful upload and for 15 minutes.
 */
export class UploadBroker {
  readonly #context: EditorContext
  readonly #ttlMs: number
  readonly #slots = new Map<string, Slot>()
  readonly #waiters = new Map<string, Set<() => void>>()
  #server: http.Server | null = null
  #starting: Promise<number> | null = null

  constructor(context: EditorContext, ttlMs = DEFAULT_TTL_MS) {
    this.#context = context
    this.#ttlMs = ttlMs
  }

  async request(): Promise<{ token: string; url: string; expiresInMinutes: number }> {
    const port = await this.#listen()
    this.#sweep()
    const token = randomBytes(16).toString('hex')
    this.#slots.set(token, { state: 'waiting', expires: Date.now() + this.#ttlMs })
    return { token, url: `http://127.0.0.1:${port}/upload/${token}`, expiresInMinutes: Math.round(this.#ttlMs / 60_000) }
  }

  /** The state of one link. With `waitMs` it holds until the upload arrives or the time is up. */
  async check(token: string, waitMs = 0): Promise<CheckOutcome> {
    const current = this.#outcome(token)
    if (current.status !== 'waiting' || waitMs <= 0) return current
    await new Promise<void>((resolve) => {
      const waiters = this.#waiters.get(token) ?? new Set<() => void>()
      const wake = () => {
        clearTimeout(timer)
        waiters.delete(wake)
        resolve()
      }
      const timer = setTimeout(wake, waitMs)
      waiters.add(wake)
      this.#waiters.set(token, waiters)
    })
    return this.#outcome(token)
  }

  async close(): Promise<void> {
    const server = this.#server
    this.#server = null
    this.#starting = null
    this.#slots.clear()
    for (const waiters of this.#waiters.values()) for (const wake of [...waiters]) wake()
    this.#waiters.clear()
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
  }

  #outcome(token: string): CheckOutcome {
    const slot = this.#slots.get(token)
    if (!slot) return { status: 'expired' }
    if (slot.state === 'done') return { status: 'done', upload: slot.upload }
    if (slot.expires < Date.now()) {
      this.#slots.delete(token)
      return { status: 'expired' }
    }
    return { status: 'waiting' }
  }

  #sweep(): void {
    const now = Date.now()
    for (const [token, slot] of this.#slots) if (slot.expires < now && slot.state !== 'busy') this.#slots.delete(token)
  }

  #listen(): Promise<number> {
    this.#starting ??= new Promise<number>((resolve, reject) => {
      const server = http.createServer((req, res) => {
        this.#handle(req, res).catch(() => {
          if (!res.headersSent) send(res, 500, 'text/plain; charset=utf-8', 'The upload failed.')
          else res.end()
        })
      })
      // A pending upload must not keep the process alive after the assistant's client has gone.
      server.unref()
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        this.#server = server
        resolve((server.address() as AddressInfo).port)
      })
    })
    return this.#starting
  }

  async #handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const port = (this.#server?.address() as AddressInfo | null)?.port
    // A page on another site can be made to talk to a local port by pointing its name at 127.0.0.1, so the name is checked.
    const host = req.headers.host
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return send(res, 403, 'text/plain; charset=utf-8', 'Not allowed.')

    const token = TOKEN_PATH.exec(new URL(req.url ?? '/', 'http://localhost').pathname)?.[1]
    if (token === undefined) return send(res, 404, 'text/plain; charset=utf-8', 'Not found.')
    const slot = this.#slots.get(token)
    const usable = slot !== undefined && slot.state === 'waiting' && slot.expires >= Date.now()

    if (req.method === 'GET') {
      if (!usable) return send(res, 410, 'text/html; charset=utf-8', gonePage())
      const nonce = randomBytes(12).toString('base64')
      return send(res, 200, 'text/html; charset=utf-8', uploadPage(nonce), nonce)
    }
    if (req.method !== 'POST') return send(res, 405, 'text/plain; charset=utf-8', 'Method not allowed.', undefined, { allow: 'GET, POST' })

    const origin = req.headers.origin
    if (origin !== undefined && origin !== `http://${host}`) return json(res, 403, { ok: false, error: 'Not allowed.' })
    if (slot === undefined || slot.state === 'done' || slot.expires < Date.now()) {
      return json(res, 410, { ok: false, error: 'This link has expired or was already used. Ask the assistant for a new one.' })
    }
    if (slot.state === 'busy') return json(res, 409, { ok: false, error: 'An upload is already in progress.' })
    const length = Number(req.headers['content-length'])
    if (!Number.isFinite(length)) return json(res, 411, { ok: false, error: 'The upload has no size.' })
    if (length > MULTIPART_BODY_LIMIT) {
      return json(res, 413, { ok: false, error: `The image is larger than ${IMAGE_BYTE_LIMIT / 1_048_576} MB.` })
    }

    this.#slots.set(token, { state: 'busy', expires: slot.expires })
    try {
      let file: FormDataEntryValue | null
      try {
        const form = await new Request('http://localhost/', {
          method: 'POST',
          headers: { 'content-type': req.headers['content-type'] ?? '' },
          body: Readable.toWeb(req) as ReadableStream,
          duplex: 'half',
        } as RequestInit).formData()
        file = form.get('file')
      } catch {
        file = null
      }
      if (!(file instanceof File)) {
        this.#slots.set(token, { state: 'waiting', expires: slot.expires })
        return json(res, 400, { ok: false, error: 'Choose an image file.' })
      }
      const form = new FormData()
      form.set('file', file)
      const outcome = await callEditorApi(this.#context, 'POST', '/images', form)
      if (!outcome.ok) {
        // The link stays valid so the person can choose another file.
        this.#slots.set(token, { state: 'waiting', expires: slot.expires })
        return json(res, 400, { ok: false, error: failureMessage(outcome.body) })
      }
      this.#slots.set(token, { state: 'done', expires: slot.expires, upload: outcome.body })
      for (const wake of [...(this.#waiters.get(token) ?? [])]) wake()
      return json(res, 200, { ok: true })
    } catch (error) {
      this.#slots.set(token, { state: 'waiting', expires: slot.expires })
      throw error
    }
  }
}

function failureMessage(body: unknown): string {
  if (typeof body === 'object' && body !== null && 'message' in body && typeof body.message === 'string') return body.message
  return 'The editor did not accept this file.'
}

function send(
  res: http.ServerResponse,
  status: number,
  type: string,
  body: string,
  nonce?: string,
  extra: Record<string, string> = {},
): void {
  const script = nonce === undefined ? '' : ` 'nonce-${nonce}'`
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'content-security-policy': `default-src 'none'; style-src 'unsafe-inline'; script-src${script || " 'none'"}; connect-src 'self'; img-src blob:; form-action 'none'; frame-ancestors 'none'`,
    ...extra,
  })
  res.end(body)
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  send(res, status, 'application/json; charset=utf-8', JSON.stringify(body))
}

/** The bear, as the editor draws it (`ui/assets/bear-mark.svg`). The page ships its own copy and loads nothing from outside. */
const BEAR = `<svg class="bear" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 19" shape-rendering="crispEdges" role="img" aria-label="BearMinion"><path fill="#074a08" d="M12 0h1v1h-1zM11 1h2v1h-2zM15 1h1v1h-1zM16 2h1v1h-1zM16 3h1v1h-1zM0 5h1v1h-1zM0 6h2v1h-2zM1 7h2v1h-2zM1 8h2v1h-2zM2 9h1v1h-1zM2 10h2v1h-2zM2 11h2v1h-2zM2 12h3v1h-3zM2 13h3v1h-3zM2 14h4v1h-4zM20 14h1v1h-1zM3 15h4v1h-4zM15 15h2v1h-2zM19 15h1v1h-1zM4 16h5v1h-5zM13 16h6v1h-6zM5 17h12v1h-12zM7 18h7v1h-7z"/><path fill="#169717" d="M13 0h3v1h-3zM16 1h1v1h-1zM1 2h4v1h-4zM8 2h6v1h-6zM0 3h2v1h-2zM4 3h12v1h-12zM0 4h1v1h-1zM4 4h14v1h-14zM4 5h15v1h-15zM3 6h12v1h-12zM16 6h4v1h-4zM3 7h6v1h-6zM10 7h3v1h-3zM19 7h2v1h-2zM3 8h9v1h-9zM20 8h1v1h-1zM3 9h9v1h-9zM20 9h1v1h-1zM4 10h8v1h-8zM20 10h1v1h-1zM4 11h8v1h-8zM20 11h1v1h-1zM5 12h8v1h-8zM19 12h2v1h-2zM5 13h10v1h-10zM17 13h4v1h-4zM6 14h14v1h-14zM7 15h8v1h-8zM17 15h2v1h-2zM9 16h4v1h-4z"/><path fill="#eeedf5" d="M13 1h2v1h-2zM14 2h2v1h-2zM2 3h2v1h-2zM1 4h3v1h-3zM1 5h3v1h-3zM2 6h1v1h-1zM13 7h6v1h-6zM12 8h4v1h-4zM19 8h1v1h-1zM12 9h4v1h-4zM19 9h1v1h-1zM12 10h5v1h-5zM18 10h2v1h-2zM12 11h8v1h-8zM13 12h6v1h-6zM15 13h2v1h-2z"/><path fill="#000000" d="M15 6h1v1h-1zM9 7h1v1h-1zM16 8h3v1h-3zM16 9h3v1h-3zM17 10h1v1h-1z"/></svg>`

const STYLE = `
:root{--ink:oklch(.21 .012 255);--muted:oklch(.5 .01 255);--line:oklch(.88 .005 250);--fill:oklch(.965 .003 250);--accent:oklch(.46 .13 145);--accent-hover:oklch(.4 .12 145);--accent-tint:oklch(.96 .03 145);--ring:oklch(.46 .13 145/.15);--danger:oklch(.52 .17 25);--saved-bg:oklch(.94 .045 145);--saved-fg:oklch(.36 .1 145);
color-scheme:light;font-family:"Bricolage Grotesque Variable","Bricolage Grotesque",ui-sans-serif,system-ui,sans-serif}
*{box-sizing:border-box}
body{margin:0;min-height:100dvh;display:grid;place-items:center;background:var(--fill);color:var(--ink);padding:1rem}
main{width:min(30rem,100%);background:#fff;border:1px solid var(--line);border-radius:1rem;padding:1.5rem;box-shadow:0 24px 48px -32px oklch(.2 .02 255/.35)}
header{display:flex;align-items:flex-start;gap:1rem}
.bear{width:5.25rem;height:auto;flex:none;image-rendering:pixelated}
.say{position:relative;flex:1;min-width:0;background:var(--fill);border:1px solid var(--line);border-radius:.75rem;padding:.75rem 1rem;margin-top:.25rem}
.say::before{content:"";position:absolute;left:-.45rem;top:1.1rem;width:.8rem;height:.8rem;background:var(--fill);border-left:1px solid var(--line);border-bottom:1px solid var(--line);transform:rotate(45deg)}
h1{font-size:1.15rem;line-height:1.3;margin:0;font-weight:650;letter-spacing:-.01em}
.say p{margin:.25rem 0 0;color:var(--muted);font-size:.9rem;line-height:1.45}
form{margin-top:1.25rem}
.drop{position:relative;display:grid;place-items:center;gap:.25rem;text-align:center;min-height:9rem;padding:1.25rem;border:1.5px dashed var(--line);border-radius:.75rem;background:#fff;cursor:pointer;transition:border-color .15s,background .15s}
.drop:hover,.drop.over{border-color:var(--accent);background:var(--accent-tint)}
.drop:focus-within{border-color:var(--accent);box-shadow:0 0 0 3px var(--ring)}
.drop input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;font-size:0}
.drop strong{font-size:.95rem}.drop span{color:var(--muted);font-size:.8rem}
.drop.has{border-style:solid}
#preview{max-width:100%;max-height:12rem;border-radius:.5rem;border:1px solid var(--line)}
#name{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.75rem;color:var(--muted);overflow-wrap:anywhere}
button{margin-top:1rem;width:100%;font:inherit;font-weight:600;min-height:2.75rem;padding:.6rem 1rem;border:0;border-radius:.5rem;background:var(--accent);color:#fff;cursor:pointer;transition:background .15s}
button:hover:not(:disabled){background:var(--accent-hover)}
button:focus-visible{outline:0;box-shadow:0 0 0 3px var(--ring)}
button:disabled{opacity:.45;cursor:default}
#status{min-height:1.5rem;margin:.75rem 0 0;font-size:.875rem;line-height:1.4}
.err{color:var(--danger)}.ok{display:inline-block;background:var(--saved-bg);color:var(--saved-fg);border-radius:.5rem;padding:.4rem .7rem}
footer{margin-top:1rem;padding-top:.75rem;border-top:1px solid var(--line);color:var(--muted);font-size:.75rem}
[hidden]{display:none!important}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}`

const head = (title: string): string =>
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title><style>${STYLE}</style>`

function gonePage(): string {
  return `${head('Link expired · BearMinion')}
<main>
<header>${BEAR}<div class="say"><h1>That link has gone stale.</h1><p>It was already used, or it is older than 15 minutes. Ask the assistant for a fresh one.</p></div></header>
</main></html>`
}

function uploadPage(nonce: string): string {
  const mb = IMAGE_BYTE_LIMIT / 1_048_576
  return `${head('Upload an image · BearMinion')}
<main>
<header>${BEAR}<div class="say"><h1>Hey. Time to upload your image.</h1><p>PNG, JPEG, WebP, GIF or AVIF, ${mb} MB tops. I'm not carrying anything heavier.</p></div></header>
<form id="form">
<label class="drop" id="drop">
<input id="file" type="file" name="file" accept="${ACCEPT}" required>
<img id="preview" alt="Your chosen image" hidden>
<strong id="title">Pick an image</strong>
<span id="hint">Tap or drop it here</span>
<span id="name"></span>
</label>
<button id="send" type="submit" disabled>Upload</button>
<p id="status" role="status" aria-live="polite"></p>
</form>
<footer>It goes straight into your site's uploads. Nothing leaves this computer.</footer>
</main>
<script nonce="${nonce}">
const limit=${IMAGE_BYTE_LIMIT};const mb=${mb};
const $=(id)=>document.getElementById(id);
const form=$('form'),input=$('file'),send=$('send'),status=$('status'),preview=$('preview'),drop=$('drop');
const say=(text,cls)=>{status.className=cls||'';status.textContent=text};
function show(file){
  say('');preview.hidden=!file;drop.classList.toggle('has',!!file);
  $('title').hidden=!!file;$('hint').hidden=!!file;$('name').textContent=file?file.name:'';
  if(!file){send.disabled=true;return}
  if(file.size>limit){send.disabled=true;preview.hidden=true;$('name').textContent='';$('title').hidden=false;$('hint').hidden=false;say('Grrr. That is over '+mb+' MB. Shrink it and try again.','err');return}
  preview.src=URL.createObjectURL(file);send.disabled=false}
input.addEventListener('change',()=>show(input.files[0]));
for(const type of ['dragenter','dragover'])drop.addEventListener(type,(event)=>{event.preventDefault();drop.classList.add('over')});
for(const type of ['dragleave','drop'])drop.addEventListener(type,()=>drop.classList.remove('over'));
drop.addEventListener('drop',(event)=>{event.preventDefault();const file=event.dataTransfer&&event.dataTransfer.files[0];if(!file)return;const list=new DataTransfer();list.items.add(file);input.files=list.files;show(file)});
form.addEventListener('submit',async(event)=>{
  event.preventDefault();const file=input.files[0];if(!file)return;send.disabled=true;say('Hauling it over…');
  try{
    const body=new FormData();body.set('file',file);
    const response=await fetch(location.pathname,{method:'POST',body});
    const data=await response.json().catch(()=>({}));
    if(response.ok&&data.ok){say('Got it. Tell the assistant, then close this tab. I am going back to sleep.','ok');input.disabled=true;drop.style.pointerEvents='none';return}
    say('Grrr. '+(data.error||'The upload failed.'),'err');send.disabled=false
  }catch{say('Grrr. The upload failed. Is the assistant still running?','err');send.disabled=false}
});
</script></html>`
}
