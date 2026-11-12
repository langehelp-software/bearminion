import { describe, expect, it } from 'vitest'
import { serveStoreAsset } from '../src/asset-route.js'
import { githubStore } from '../src/github-store.js'
import { FakeGithub } from './fake-github.js'

const PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
  (char) => char.charCodeAt(0),
)
const url = (src: string) => `https://admin.example.com/__bearminion/assets?src=${encodeURIComponent(src)}`

function setup() {
  const github = new FakeGithub({ files: { 'src/assets/hero.png': PNG, 'content/site.json': '{"secret":true}' } })
  return { github, store: githubStore({ repo: 'acme/site', token: 't', fetch: github.fetch }) }
}

describe('serveStoreAsset', () => {
  it('serves an image from the repository with its type, a validator and a private cache', async () => {
    const { store } = setup()
    const response = await serveStoreAsset(new Request(url('src/assets/hero.png')), store)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('cache-control')).toBe('private, max-age=300')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('etag')).toBeTruthy()
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual(Array.from(PNG))
  })

  it('answers 304 when the browser already has it, and HEAD without a body', async () => {
    const { store } = setup()
    const first = await serveStoreAsset(new Request(url('src/assets/hero.png')), store)
    const etag = first.headers.get('etag') as string
    const revalidated = await serveStoreAsset(new Request(url('src/assets/hero.png'), { headers: { 'if-none-match': etag } }), store)
    expect(revalidated.status).toBe(304)
    const head = await serveStoreAsset(new Request(url('src/assets/hero.png'), { method: 'HEAD' }), store)
    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')
  })

  it('answers a missing file with 404 and a visible placeholder, and HEAD with 404 and no body', async () => {
    const { store } = setup()
    const get = await serveStoreAsset(new Request(url('src/assets/gone.png')), store)
    expect(get.status).toBe(404)
    expect(get.headers.get('content-type')).toBe('image/svg+xml')
    expect(await get.text()).toContain('Missing image')
    const head = await serveStoreAsset(new Request(url('src/assets/gone.png'), { method: 'HEAD' }), store)
    expect(head.status).toBe(404)
    expect(await head.text()).toBe('')
  })

  it('serves nothing that is not an image under src/assets, and no other method', async () => {
    const { store } = setup()
    for (const src of ['content/site.json', 'src/assets/../../content/site.json', 'src/assets/hero.svg', '', '/src/assets/hero.png']) {
      const response = await serveStoreAsset(new Request(url(src)), store)
      expect(response.status, src).toBe(404)
      expect(await response.text(), src).not.toContain('secret')
    }
    expect((await serveStoreAsset(new Request(url('src/assets/hero.png'), { method: 'POST' }), store)).status).toBe(405)
  })

  it('passes a GitHub failure on as a readable error', async () => {
    const { github, store } = setup()
    github.mode = 'unauthorized'
    const response = await serveStoreAsset(new Request(url('src/assets/hero.png')), store)
    expect(response.status).toBe(502)
    expect(((await response.json()) as { error: string }).error).toBe('github_auth')
  })

  it('says so when the store cannot serve images', async () => {
    const { store } = setup()
    const { readAsset: _readAsset, ...withoutRead } = store
    expect((await serveStoreAsset(new Request(url('src/assets/hero.png')), withoutRead)).status).toBe(501)
  })
})
