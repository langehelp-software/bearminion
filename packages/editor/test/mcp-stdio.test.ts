import fs from 'node:fs'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { describe, expect, it } from 'vitest'

const cli = path.resolve(import.meta.dirname, '../dist/cli.js')
const starter = path.resolve(import.meta.dirname, '../../../templates/default')

/** The built command, over a real stdio pipe: what an assistant's client starts. It only reads, so it can use the starter itself. */
describe.skipIf(!fs.existsSync(cli))('bearminion mcp over stdio', () => {
  it('starts, lists the tools and reads a page', async () => {
    const transport = new StdioClientTransport({ command: process.execPath, args: [cli, 'mcp', '--cwd', starter], stderr: 'pipe' })
    const client = new Client({ name: 'test', version: '1' })
    await client.connect(transport)
    try {
      const { tools } = await client.listTools()
      expect(tools.map((tool) => tool.name)).toContain('save_page')
      const page = (await client.callTool({ name: 'get_page', arguments: { slug: 'index' } })) as { content: Array<{ text: string }> }
      expect(JSON.parse(page.content[0]?.text ?? '{}').slug).toBe('index')
    } finally {
      await client.close()
    }
  }, 20000)

  it('says what is missing when the site has no content model', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [cli, 'mcp', '--cwd', path.resolve(starter, 'src')],
      stderr: 'pipe',
    })
    const client = new Client({ name: 'test', version: '1' })
    const errors: string[] = []
    transport.stderr?.on('data', (chunk: Buffer) => errors.push(String(chunk)))
    await expect(client.connect(transport)).rejects.toThrow()
    expect(errors.join('')).toContain('No content model')
  }, 20000)
})
