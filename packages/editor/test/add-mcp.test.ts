import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { MCP_SDK } from '../src/add/mcp.js'
import { run } from '../src/command.js'

const SPEC = '@modelcontextprotocol/sdk@^1.32.2'

function site(options: { lock?: string; devDependencies?: Record<string, string>; noPackage?: boolean } = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-addmcp-'))
  if (!options.noPackage) {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'site', devDependencies: options.devDependencies ?? {} }))
  }
  if (options.lock) fs.writeFileSync(path.join(dir, options.lock), '')
  return dir
}

async function addMcp(
  dir: string,
  args: string[] = [],
  io: { exec?: (c: string, a: string[], cwd: string) => number; confirm?: () => Promise<boolean> } = {},
) {
  const lines: string[] = []
  const calls: Array<{ command: string; args: string[]; cwd: string }> = []
  const exec = io.exec ?? (() => 0)
  const code = await run(['add', 'mcp', ...args, '--cwd', dir], {
    log: (line) => lines.push(line),
    exec: (command, commandArgs, cwd) => {
      calls.push({ command, args: commandArgs, cwd })
      return exec(command, commandArgs, cwd)
    },
    ...(io.confirm ? { confirm: io.confirm } : {}),
  })
  return { code, out: lines.join('\n'), calls }
}

describe('bearminion add mcp', () => {
  it('installs the SDK as a dev dependency with the manager the site uses, and shows how to connect', async () => {
    const dir = site({ lock: 'pnpm-lock.yaml' })
    const { code, out, calls } = await addMcp(dir, ['--yes'])
    expect(code).toBe(0)
    expect(calls).toEqual([{ command: 'pnpm', args: ['add', '-D', SPEC], cwd: dir }])
    expect(out).toContain('claude mcp add bearminion -- npx bearminion mcp')
    const config = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1))
    expect(config.mcpServers.bearminion).toEqual({ command: 'npx', args: ['bearminion', 'mcp', '--cwd', dir] })
  })

  it('uses each manager’s own dev flag', async () => {
    expect((await addMcp(site(), ['--yes'])).calls[0]).toMatchObject({ command: 'npm', args: ['install', '-D', SPEC] })
    expect((await addMcp(site({ lock: 'yarn.lock' }), ['--yes'])).calls[0]).toMatchObject({ command: 'yarn', args: ['add', '-D', SPEC] })
    expect((await addMcp(site({ lock: 'bun.lock' }), ['--yes'])).calls[0]).toMatchObject({ command: 'bun', args: ['add', '-d', SPEC] })
  })

  it('shows the command and runs nothing with --dry-run', async () => {
    const { code, out, calls } = await addMcp(site({ lock: 'pnpm-lock.yaml' }), ['--dry-run'])
    expect(code).toBe(0)
    expect(calls).toEqual([])
    expect(out).toContain(`Would run: pnpm add -D ${SPEC}`)
  })

  it('asks first in a terminal, and stops on no', async () => {
    const dir = site()
    const no = await addMcp(dir, [], { confirm: async () => false })
    expect(no.code).toBe(1)
    expect(no.calls).toEqual([])
    const yes = await addMcp(dir, [], { confirm: async () => true })
    expect(yes.code).toBe(0)
    expect(yes.calls).toHaveLength(1)
  })

  it('does not install when it cannot ask and was not told to', async () => {
    const { code, out, calls } = await addMcp(site())
    expect(code).toBe(1)
    expect(calls).toEqual([])
    expect(out).toContain('--yes')
  })

  it('reports a failed install with the command to run by hand', async () => {
    const { code, out } = await addMcp(site({ lock: 'pnpm-lock.yaml' }), ['--yes'], { exec: () => 1 })
    expect(code).toBe(1)
    expect(out).toContain(`run it yourself: pnpm add -D ${SPEC}`)
    expect(out).not.toContain('claude mcp add')
  })

  it('installs nothing when the SDK is already there, and still shows how to connect', async () => {
    const { code, out, calls } = await addMcp(site({ devDependencies: { '@modelcontextprotocol/sdk': '^1.30.0' } }), ['--yes'])
    expect(code).toBe(0)
    expect(calls).toEqual([])
    expect(out).toContain('already in this site')
    expect(out).toContain('claude mcp add')
  })

  it('needs a package.json', async () => {
    const { code, out, calls } = await addMcp(site({ noPackage: true }), ['--yes'])
    expect(code).toBe(1)
    expect(calls).toEqual([])
    expect(out).toContain('package.json')
  })

  it('asks for the same SDK range the editor declares as its optional peer', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../package.json'), 'utf8'))
    expect(MCP_SDK).toEqual({ '@modelcontextprotocol/sdk': pkg.peerDependencies['@modelcontextprotocol/sdk'] })
    expect(pkg.peerDependenciesMeta['@modelcontextprotocol/sdk'].optional).toBe(true)
  })

  it('is not in a new site by default', () => {
    const starter = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../../templates/default/package.json'), 'utf8'))
    expect({ ...starter.dependencies, ...starter.devDependencies }['@modelcontextprotocol/sdk']).toBeUndefined()
  })
})
