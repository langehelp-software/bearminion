import { describe, expect, it } from 'vitest'
import { parseCliArgs, UsageError } from '../src/args.js'

describe('parseCliArgs', () => {
  it('defaults to installing, creating a git repository and no Storybook', () => {
    expect(parseCliArgs([])).toEqual({ install: true, git: true, storybook: false, yes: false, help: false, version: false })
  })

  it('reads the directory and every option', () => {
    expect(
      parseCliArgs(['site', '--name', 'Acme', '--url', 'acme.com', '--pm', 'pnpm', '--storybook', '--no-install', '--no-git', '-y']),
    ).toEqual({
      directory: 'site',
      name: 'Acme',
      url: 'acme.com',
      packageManager: 'pnpm',
      install: false,
      git: false,
      storybook: true,
      yes: true,
      help: false,
      version: false,
    })
  })

  it('refuses an unknown package manager, an unknown option and two directories', () => {
    expect(() => parseCliArgs(['--pm', 'deno'])).toThrow(UsageError)
    expect(() => parseCliArgs(['--template', 'x'])).toThrow(UsageError)
    expect(() => parseCliArgs(['one', 'two'])).toThrow(/one directory/)
  })
})
