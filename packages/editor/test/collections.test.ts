import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { collection, createHostedContext, githubStore, handleHostedRequest } from '../src/hosted.js'
import { fieldDefinitions, resolveCollections } from '../src/collections.js'
import { stableStringify } from '../src/stable-json.js'
import { API_PREFIX } from '../src/model.js'
import { FakeGithub } from './fake-github.js'
import { sectionRegistry, siteDefinition } from './starter.js'

const blogSchema = ({ image }: { image: () => z.ZodType }) =>
  z.object({
    title: z.string().min(1).max(80),
    pubDate: z.coerce.date(),
    draft: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
    cover: image().optional(),
    note: z.custom<string>((value) => typeof value === 'string').optional(),
    slugLike: z
      .string()
      .refine((value) => !value.includes(' '), 'No spaces')
      .optional(),
  })

const POST = [
  '---',
  '# keep this comment',
  'title: "First post"   # trailing',
  'pubDate: 2026-01-05',
  'tags: [news, release]',
  'draft:   false',
  '---',
  '',
  'Intro paragraph with *emphasis*.',
  '',
  '<aside>raw html</aside>',
  '',
  '## Heading',
  '',
  'Last paragraph.',
  '',
].join('\n')

const site = { name: 'Hosted', url: 'https://hosted.example', seo: {}, header: { links: [] }, footer: { columns: [] } }
const origin = { 'sec-fetch-site': 'same-origin', origin: 'https://admin.example.com' }

function setup(options: { rename?: boolean; delete?: boolean; mode?: 'direct' | 'pr' } = {}) {
  const github = new FakeGithub({
    files: {
      'content/site.json': stableStringify(site),
      'src/content/blog/en/first-post.md': POST,
      'src/content/blog/en/Bad Name.md': '---\ntitle: x\n---\n',
      'src/content/blog/en/notes.txt': 'not markdown',
    },
  })
  const context = createHostedContext({
    sections: sectionRegistry,
    site: siteDefinition,
    store: githubStore({ repo: 'acme/site', token: 't', fetch: github.fetch, ...(options.mode ? { mode: options.mode } : {}) }),
    collections: {
      'blog-en': collection({ schema: blogSchema, path: 'src/content/blog/en/{slug}.md', label: 'Blog (EN)', ...options }),
    },
  })
  async function call(method: string, pathname: string, body?: unknown): Promise<Response> {
    const response = await handleHostedRequest(
      new Request(`https://admin.example.com${API_PREFIX}${pathname}`, {
        method,
        headers: { host: 'admin.example.com', ...origin, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      context,
    )
    if (response === null) throw new Error('no response')
    return response
  }
  return { github, call }
}

const ENTRIES = '/collections/blog-en/entries'

describe('collection()', () => {
  it('checks the path template when the config loads', () => {
    expect(() => collection({ schema: z.object({}), path: 'src/content/blog/{slug}.md' })).not.toThrow()
    for (const path of [
      'src/content/blog/post.md',
      '{slug}.md',
      'src/{slug}.txt',
      '/abs/{slug}.md',
      'src/../x/{slug}.md',
      'src/{slug}/index.md',
    ]) {
      expect(() => collection({ schema: z.object({}), path }), path).toThrow(/collection path/)
    }
  })

  it('resolves ids, folders, extensions and safe defaults', () => {
    const [resolved] = Object.values(
      resolveCollections({ blog: collection({ schema: z.object({}), path: 'src/content/blog/{slug}.mdx' }) }),
    )
    expect(resolved).toMatchObject({ id: 'blog', label: 'blog', dir: 'src/content/blog', ext: '.mdx', rename: false, delete: false })
    expect(() => resolveCollections({ 'Bad Id': collection({ schema: z.object({}), path: 'a/{slug}.md' }) })).toThrow(/kebab-case/)
  })
})

describe('fieldDefinitions', () => {
  it('describes fields, dates and images, and marks what it cannot describe read-only', () => {
    const [resolved] = Object.values(resolveCollections({ blog: collection({ schema: blogSchema, path: 'a/{slug}.md' }) }))
    const fields = Object.fromEntries((fieldDefinitions(resolved?.schema as z.ZodType) ?? []).map((field) => [field.name, field]))
    expect(fields.title).toMatchObject({ required: true, readOnly: false, schema: { type: 'string', minLength: 1, maxLength: 80 } })
    expect(fields.pubDate).toMatchObject({ required: true, readOnly: false, schema: { type: 'string', 'x-bm': 'date' } })
    expect(fields.draft).toMatchObject({ required: false, schema: { type: 'boolean', default: false } })
    expect(fields.tags?.schema).toMatchObject({ type: 'array', items: { type: 'string' } })
    expect(fields.cover?.schema).toMatchObject({ type: 'string', bearminion: 'image' })
    expect(fields.note).toMatchObject({ readOnly: true })
    expect(fields.slugLike).toMatchObject({ readOnly: false, schema: { type: 'string' } })
  })

  it('returns null for a schema that is not an object', () => {
    expect(fieldDefinitions(z.string())).toBeNull()
  })
})

describe('the collections API', () => {
  it('lists collections with their fields', async () => {
    const { call } = setup()
    const body = (await (await call('GET', '/collections')).json()) as {
      collections: { id: string; label: string; path: string; rename: boolean; delete: boolean; fields: unknown[] }[]
    }
    expect(body.collections).toHaveLength(1)
    expect(body.collections[0]).toMatchObject({
      id: 'blog-en',
      label: 'Blog (EN)',
      path: 'src/content/blog/en/{slug}.md',
      rename: false,
      delete: false,
    })
    expect(body.collections[0]?.fields).toHaveLength(7)
  })

  it('lists entries, skipping files that are not valid slugs or not markdown', async () => {
    const { call } = setup()
    expect(await (await call('GET', ENTRIES)).json()).toEqual({ entries: [{ slug: 'first-post' }], skipped: ['Bad Name.md'] })
  })

  it('reads an entry: fields as JSON, body as blocks, raw HTML locked', async () => {
    const { call } = setup()
    const entry = (await (await call('GET', `${ENTRIES}/first-post`)).json()) as {
      fields: Record<string, unknown>
      blocks: { id: string; type: string; editable: boolean }[]
    }
    expect(entry.fields).toEqual({ title: 'First post', pubDate: '2026-01-05', tags: ['news', 'release'], draft: false })
    expect(entry.blocks.map((block) => `${block.type}:${block.editable}`)).toEqual([
      'paragraph:true',
      'html:false',
      'heading:true',
      'paragraph:true',
    ])
  })

  it('answers 404 for a missing entry or collection, 400 for a bad slug', async () => {
    const { call } = setup()
    expect((await call('GET', `${ENTRIES}/nope`)).status).toBe(404)
    expect((await call('GET', '/collections/nope/entries')).status).toBe(404)
    expect((await call('GET', '/collections/__proto__/entries')).status).toBe(404)
    expect((await call('GET', `${ENTRIES}/..%2Fx`)).status).toBe(400)
  })

  it('saves one field and one paragraph as one commit that touches only those lines', async () => {
    const { github, call } = setup()
    const before = github.commitCount
    const response = await call('PUT', `${ENTRIES}/first-post`, {
      set: { title: 'Renamed post' },
      blocks: [{ id: 'b0', markdown: 'Edited intro.' }, { id: 'b1' }, { id: 'b2' }, { id: 'b3' }],
    })
    expect(response.status).toBe(200)
    expect(github.commitCount).toBe(before + 1)
    expect(github.text('src/content/blog/en/first-post.md')).toBe(
      POST.replace('title: "First post"   # trailing', 'title: "Renamed post"   # trailing').replace(
        'Intro paragraph with *emphasis*.',
        'Edited intro.',
      ),
    )
  })

  it('writes nothing when the patch changes nothing', async () => {
    const { github, call } = setup()
    const before = github.commitCount
    const response = await call('PUT', `${ENTRIES}/first-post`, { blocks: [{ id: 'b0' }, { id: 'b1' }, { id: 'b2' }, { id: 'b3' }] })
    expect(response.status).toBe(200)
    expect(github.commitCount).toBe(before)
  })

  it('validates the whole resulting entry with the site’s own schema and writes nothing on failure', async () => {
    const { github, call } = setup()
    const before = github.commitCount
    const tooLong = await call('PUT', `${ENTRIES}/first-post`, { set: { title: 'x'.repeat(81) } })
    expect(tooLong.status).toBe(400)
    expect(((await tooLong.json()) as { issues: { path: string }[] }).issues[0]?.path).toBe('title')
    const refined = await call('PUT', `${ENTRIES}/first-post`, { set: { slugLike: 'has space' } })
    expect(((await refined.json()) as { issues: { message: string }[] }).issues[0]?.message).toBe('No spaces')
    const badDate = await call('PUT', `${ENTRIES}/first-post`, { set: { pubDate: 'not a date' } })
    expect(badDate.status).toBe(400)
    expect(github.commitCount).toBe(before)
  })

  it('refuses to edit a locked block, an unknown block and a bad field name', async () => {
    const { github, call } = setup()
    const before = github.commitCount
    expect((await call('PUT', `${ENTRIES}/first-post`, { blocks: [{ id: 'b1', markdown: 'text' }] })).status).toBe(409)
    expect((await call('PUT', `${ENTRIES}/first-post`, { blocks: [{ id: 'b9' }] })).status).toBe(400)
    // Zod drops an own `__proto__` key, so the patch is empty; either way nothing may be written.
    await call('PUT', `${ENTRIES}/first-post`, JSON.parse('{"set":{"__proto__":1}}'))
    expect((await call('PUT', `${ENTRIES}/first-post`, { set: { 'a b': 1 } })).status).toBe(400)
    expect((await call('PUT', `${ENTRIES}/first-post`, { nonsense: true })).status).toBe(400)
    expect(github.commitCount).toBe(before)
  })

  it('keeps the raw HTML block through an edit that deletes another block', async () => {
    const { github, call } = setup()
    await call('PUT', `${ENTRIES}/first-post`, { blocks: [{ id: 'b0' }, { id: 'b1' }, { id: 'b3' }] })
    const text = github.text('src/content/blog/en/first-post.md')
    expect(text).toContain('<aside>raw html</aside>')
    expect(text).not.toContain('## Heading')
  })

  it('creates an entry, refuses a duplicate and an invalid one', async () => {
    const { github, call } = setup()
    const created = await call('POST', ENTRIES, {
      slug: 'second-post',
      fields: { title: 'Second', pubDate: '2026-02-01', tags: ['a'] },
      body: 'Hello.',
    })
    expect(created.status).toBe(201)
    expect(github.text('src/content/blog/en/second-post.md')).toBe('---\ntitle: Second\npubDate: 2026-02-01\ntags:\n  - a\n---\n\nHello.\n')
    expect((await call('POST', ENTRIES, { slug: 'second-post', fields: { title: 'x', pubDate: '2026-02-01' } })).status).toBe(409)
    expect((await call('POST', ENTRIES, { slug: 'Bad Slug', fields: {} })).status).toBe(400)
    const invalid = await call('POST', ENTRIES, { slug: 'third', fields: { pubDate: '2026-02-01' } })
    expect(invalid.status).toBe(400)
    expect(github.text('src/content/blog/en/third.md')).toBeUndefined()
  })

  it('locks delete and rename by default, and honours them when enabled', async () => {
    const locked = setup()
    expect((await locked.call('DELETE', `${ENTRIES}/first-post`)).status).toBe(409)
    expect((await locked.call('POST', `${ENTRIES}/first-post/rename`, { slug: 'moved' })).status).toBe(409)
    expect(locked.github.text('src/content/blog/en/first-post.md')).toBe(POST)

    const open = setup({ rename: true, delete: true })
    const renamed = await open.call('POST', `${ENTRIES}/first-post/rename`, { slug: 'moved' })
    expect(renamed.status).toBe(200)
    expect(open.github.text('src/content/blog/en/first-post.md')).toBeUndefined()
    expect(open.github.text('src/content/blog/en/moved.md')).toBe(POST)
    expect((await open.call('DELETE', `${ENTRIES}/moved`)).status).toBe(200)
    expect(open.github.text('src/content/blog/en/moved.md')).toBeUndefined()
    expect((await open.call('DELETE', `${ENTRIES}/moved`)).status).toBe(404)
  })

  it('in pr mode, sends each entry to its own pull request and leaves the base untouched', async () => {
    const { github, call } = setup({ mode: 'pr' })
    const saved = await call('PUT', `${ENTRIES}/first-post`, { set: { title: 'Changed' } })
    expect(saved.status).toBe(200)
    expect(github.text('src/content/blog/en/first-post.md')).toBe(POST)
    expect(github.pulls).toHaveLength(1)
    expect(github.pulls[0]?.head).toBe('bearminion/collection/blog-en/first-post')
    expect(github.pulls[0]?.title).toBe('Edit blog-en: first-post')
    expect(github.text('src/content/blog/en/first-post.md', 'bearminion/collection/blog-en/first-post')).toContain('title: "Changed"')
    // A second save to the same entry joins the same pull request.
    await call('PUT', `${ENTRIES}/first-post`, { set: { draft: true } })
    expect(github.pulls).toHaveLength(1)
  })
})
