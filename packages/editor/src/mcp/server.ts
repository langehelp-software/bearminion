import path from 'node:path'
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { indexGuide, sectionGuide } from '../guide/section-guide.js'
import type { EditorContext } from '../options.js'
import { type ApiResult, callEditorApi } from './adapter.js'
import { allowedRoots, imageFromPath, UploadRefused, videoFromPath } from './uploads.js'
import { UploadBroker } from './upload-page.js'

const INSTRUCTIONS = `This server edits the content of a BearMinion site: pages made of sections, and the site header and footer. Every write is checked against the site's schemas, and a rejected write returns the field and the reason. Changes go to the files in the project, where git shows them.

How to work:
1. Call list_sections, then get_section_guide for each section type you will write. The guide lists the variants, fields, limits and what each section is for.
2. Call get_page, change what is needed, and send the whole page back with save_page.
3. To emphasize a phrase in a heading, set "em" to that exact phrase. Never write "marks" by hand: when you change a heading, remove its "marks" and set "em" instead.
4. Leave a section whose type is not listed by list_sections exactly as it is.
5. To add a picture the person has not given you a path to, call request_upload and give them the link: they choose the image in their browser, then call check_upload with the token to get its path. If you have a path to a file inside the project, call upload_image with it. Use the returned path as the image src and write alt text that describes the picture. A video goes the same way with upload_video, and its url goes in the Media section's video field.
6. rename_page does not update links that point at the old slug: look for them with get_page on the other pages and fix them.`

const slug = z.string().describe('The page slug: lowercase words joined by hyphens. The home page is "index".')

function text(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

/** A failed write is returned to the assistant as a tool error carrying the editor's own message, so it can fix and retry. */
function result(outcome: ApiResult): CallToolResult {
  return { content: [{ type: 'text', text: text(outcome.body) }], ...(outcome.ok ? {} : { isError: true }) }
}

export interface ServerOptions {
  /** Folders outside the project that uploads may be read from. The project itself is always allowed. */
  uploadsFrom?: readonly string[]
  /** How long an upload link works, in milliseconds. Fifteen minutes by default. */
  uploadLinkTtlMs?: number
}

export function createBearminionServer(context: EditorContext, options: ServerOptions = {}): McpServer {
  const server = new McpServer({ name: 'bearminion', version: '1' }, { instructions: INSTRUCTIONS })
  const sections = context.sections
  const uploads = new UploadBroker(context, options.uploadLinkTtlMs)
  const previousClose = server.server.onclose
  server.server.onclose = () => {
    void uploads.close()
    previousClose?.()
  }
  const read = { readOnlyHint: true, openWorldHint: false }
  const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }

  server.registerTool(
    'list_sections',
    {
      title: 'List sections',
      description: "The section types this site has, one line each. Read a section's guide before writing it.",
      annotations: read,
    },
    () => ({ content: [{ type: 'text', text: indexGuide(sections) }] }),
  )

  server.registerTool(
    'get_section_guide',
    {
      title: 'Get a section guide',
      description: 'How to fill one section: its variants, options, fields, limits, defaults and when to use it.',
      inputSchema: { type: z.string().describe('A section type from list_sections, such as "hero".') },
      annotations: read,
    },
    ({ type }) => {
      const definition = sections[type]
      if (!definition) {
        return {
          isError: true,
          content: [{ type: 'text', text: `No section called "${type}". This site has: ${Object.keys(sections).sort().join(', ')}.` }],
        }
      }
      return { content: [{ type: 'text', text: sectionGuide(definition) }] }
    },
  )

  server.registerTool(
    'list_pages',
    {
      title: 'List pages',
      description: 'Every page: slug, title and the anchors its sections define. Not the sections themselves; use get_page for those.',
      annotations: read,
    },
    async () => {
      const outcome = await callEditorApi(context, 'GET', '/pages')
      if (!outcome.ok) return result(outcome)
      const pages = (outcome.body as { pages: Array<{ slug: string; title: string; system: boolean; anchors: string[] }> }).pages
      return {
        content: [
          {
            type: 'text',
            text: text(pages.map(({ slug: pageSlug, title, system, anchors }) => ({ slug: pageSlug, title, system, anchors }))),
          },
        ],
      }
    },
  )

  server.registerTool(
    'get_page',
    {
      title: 'Get a page',
      description: 'One page as stored: slug, title, seo and its sections.',
      inputSchema: { slug },
      annotations: read,
    },
    async (input) => result(await callEditorApi(context, 'GET', `/pages/${encodeURIComponent(input.slug)}`)),
  )

  server.registerTool(
    'save_page',
    {
      title: 'Save a page',
      description:
        'Replaces a page with the document you send. Send the whole page, as get_page returned it with your changes. The write is checked against the section schemas; a rejected write returns each field and the reason, and changes nothing.',
      inputSchema: { slug, page: z.record(z.string(), z.unknown()).describe('The whole page document: slug, title, seo, sections.') },
      annotations: write,
    },
    async (input) => result(await callEditorApi(context, 'PUT', `/pages/${encodeURIComponent(input.slug)}`, input.page)),
  )

  server.registerTool(
    'save_pages',
    {
      title: 'Save several pages',
      description:
        'Saves a list of whole pages one after another, for a change that touches many pages. It is not atomic: each page is saved or rejected on its own, and the result says which. Fix the rejected ones and send them again.',
      inputSchema: {
        pages: z
          .array(z.object({ slug, page: z.record(z.string(), z.unknown()) }))
          .min(1)
          .max(50),
      },
      annotations: write,
    },
    async (input) => {
      const results: Array<{ slug: string; saved: boolean; error?: unknown }> = []
      for (const entry of input.pages) {
        const outcome = await callEditorApi(context, 'PUT', `/pages/${encodeURIComponent(entry.slug)}`, entry.page)
        results.push(outcome.ok ? { slug: entry.slug, saved: true } : { slug: entry.slug, saved: false, error: outcome.body })
      }
      return { content: [{ type: 'text', text: text(results) }], ...(results.some((entry) => !entry.saved) ? { isError: true } : {}) }
    },
  )

  server.registerTool(
    'create_page',
    {
      title: 'Create a page',
      description:
        "Adds a page. It starts from the site's template page when one is named, otherwise with no sections; then fill it with save_page.",
      inputSchema: {
        slug,
        title: z.string().min(1),
        template: z.string().optional().describe('The slug of a page to copy the sections of.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (input) => result(await callEditorApi(context, 'POST', '/pages', input)),
  )

  server.registerTool(
    'delete_page',
    {
      title: 'Delete a page',
      description: 'Deletes a page file. The home page and system pages cannot be deleted. Git can bring it back; there is no undo here.',
      inputSchema: { slug },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (input) => result(await callEditorApi(context, 'DELETE', `/pages/${encodeURIComponent(input.slug)}`)),
  )

  server.registerTool(
    'rename_page',
    {
      title: 'Rename a page',
      description: 'Changes a page slug. Links to the old slug elsewhere on the site are NOT updated: check the other pages and fix them.',
      inputSchema: { slug, newSlug: slug },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (input) =>
      result(await callEditorApi(context, 'POST', `/pages/${encodeURIComponent(input.slug)}/rename`, { slug: input.newSlug })),
  )

  server.registerTool(
    'set_home_page',
    {
      title: 'Set the home page',
      description: 'Makes a page the home page ("/"). The current home page moves to previousSlug, so the site never has two or none.',
      inputSchema: { slug, previousSlug: slug.optional().describe('Where the current home page goes. Required while a home page exists.') },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (input) =>
      result(
        await callEditorApi(
          context,
          'POST',
          `/pages/${encodeURIComponent(input.slug)}/set-home`,
          input.previousSlug === undefined ? {} : { previousSlug: input.previousSlug },
        ),
      ),
  )

  server.registerTool(
    'get_site',
    { title: 'Get the site settings', description: 'The site document: header, footer and site-wide settings.', annotations: read },
    async () => result(await callEditorApi(context, 'GET', '/site')),
  )

  server.registerTool(
    'save_site',
    {
      title: 'Save the site settings',
      description:
        'Replaces the site document with the one you send: the whole document, as get_site returned it with your changes. Checked against the site schema.',
      inputSchema: { site: z.record(z.string(), z.unknown()) },
      annotations: write,
    },
    async (input) => result(await callEditorApi(context, 'PUT', '/site', input.site)),
  )

  server.registerTool(
    'list_images',
    { title: 'List images', description: 'The images already in the project, with the path to use in a section.', annotations: read },
    async () => result(await callEditorApi(context, 'GET', '/images')),
  )

  const uploadFailure = (error: unknown): CallToolResult => {
    if (error instanceof UploadRefused) return { isError: true, content: [{ type: 'text', text: error.message }] }
    throw error
  }
  const created = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }

  server.registerTool(
    'upload_image',
    {
      title: 'Upload an image',
      description:
        'Adds an image to the project and returns its path, to use as an image src in a section. Give the path of a file on this machine: it must be inside the project or a folder the person allowed with --uploads-from. If you have no path, call request_upload instead. Png, jpeg, webp, gif or avif, up to 5 MB; the contents must match the type. The file is copied, not moved. Write the alt text yourself, describing the picture.',
      inputSchema: {
        path: z.string().describe('Path of an image file on this machine.'),
        name: z.string().optional().describe('A name for the file. Defaults to the file name. A short random suffix is added.'),
      },
      annotations: created,
    },
    async (input) => {
      try {
        const file = await imageFromPath(
          path.resolve(context.root, input.path),
          await allowedRoots(context.root, options.uploadsFrom ?? []),
          input.name,
        )
        const form = new FormData()
        form.set('file', file)
        return result(await callEditorApi(context, 'POST', '/images', form))
      } catch (error) {
        return uploadFailure(error)
      }
    },
  )

  server.registerTool(
    'request_upload',
    {
      title: 'Ask the person for an image',
      description:
        'Returns a link for the person to open in their browser, on this computer. It shows a file picker for one image (png, jpeg, webp, gif or avif, up to 5 MB). Give them the link and ask them to choose the file, then call check_upload with the token. Use this when the person wants to add a picture and you have no path to it: a picture attached to the chat cannot be passed to this server. The link works once and for 15 minutes.',
      annotations: created,
    },
    async () => {
      const { token, url, expiresInMinutes } = await uploads.request()
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                token,
                url,
                expiresInMinutes,
                next: 'Give the person the url. When they say they have chosen the image, call check_upload with the token.',
              },
              null,
              2,
            ),
          },
        ],
      }
    },
  )

  server.registerTool(
    'check_upload',
    {
      title: 'Check for an uploaded image',
      description:
        'Waits up to 25 seconds for the image the person is choosing at the link from request_upload, then returns its path to use as an image src, or says it is still waiting. Call it again if it is still waiting.',
      inputSchema: {
        token: z.string().describe('The token from request_upload.'),
        waitSeconds: z.number().int().min(0).max(25).optional().describe('How long to wait for the upload. Defaults to 20.'),
      },
      annotations: read,
    },
    async ({ token, waitSeconds }) => {
      const outcome = await uploads.check(token, (waitSeconds ?? 20) * 1000)
      if (outcome.status === 'done') return { content: [{ type: 'text', text: JSON.stringify(outcome.upload, null, 2) }] }
      if (outcome.status === 'waiting') {
        return { content: [{ type: 'text', text: 'Still waiting: the person has not uploaded the image yet. Call check_upload again.' }] }
      }
      return {
        isError: true,
        content: [{ type: 'text', text: 'This link has expired or the token is not known. Call request_upload for a new link.' }],
      }
    },
  )

  server.registerTool(
    'upload_video',
    {
      title: 'Upload a video',
      description:
        "Adds a video file to the project and returns its url, to use in a Media section's video field. Give the path of a file on this machine: inside the project or a folder allowed with --uploads-from. Mp4, webm, mov or ogv, up to the size limit shown in the error when it is exceeded; a hosted YouTube or Vimeo link needs no upload.",
      inputSchema: {
        path: z.string().describe('Path of a video file on this machine.'),
        name: z.string().optional().describe('A name for the file. Defaults to the file name.'),
      },
      annotations: created,
    },
    async (input) => {
      try {
        const file = await videoFromPath(
          path.resolve(context.root, input.path),
          await allowedRoots(context.root, options.uploadsFrom ?? []),
          context.maxVideoBytes,
          input.name,
        )
        const form = new FormData()
        form.set('file', file)
        return result(await callEditorApi(context, 'POST', '/videos', form))
      } catch (error) {
        return uploadFailure(error)
      }
    },
  )

  server.registerResource(
    'sections',
    'bearminion://sections',
    { title: 'Sections in this site', description: 'The section types this site has and how to read a guide.', mimeType: 'text/markdown' },
    (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: indexGuide(sections) }] }),
  )

  server.registerResource(
    'section-guide',
    new ResourceTemplate('bearminion://sections/{type}', {
      list: () => ({
        resources: Object.values(sections).map((definition) => ({
          uri: `bearminion://sections/${definition.type}`,
          name: definition.label,
          description: definition.description,
          mimeType: 'text/markdown',
        })),
      }),
    }),
    { title: 'Section guide', description: 'How to fill one section.', mimeType: 'text/markdown' },
    (uri, variables) => {
      const type = String(variables.type)
      const definition = sections[type]
      if (!definition) throw new Error(`No section called "${type}".`)
      return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: sectionGuide(definition) }] }
    },
  )

  return server
}
