import { describe, expect, it } from 'vitest'
import { normalizeUrl, toPackageName, toSiteName } from '../src/names.js'
import { detectPackageManager, runCommand } from '../src/package-manager.js'

describe('toPackageName', () => {
  it('turns the folder into a valid npm name', () => {
    expect(toPackageName('My Coffee Shop')).toBe('my-coffee-shop')
    expect(toPackageName('./sites/Acme.Site')).toBe('acme.site')
    expect(toPackageName('__weird__name--')).toBe('weird__name')
  })

  it('falls back when nothing usable is left', () => {
    expect(toPackageName('---')).toBe('my-site')
  })
})

describe('toSiteName', () => {
  it('title-cases the folder name', () => {
    expect(toSiteName('my-coffee_shop')).toBe('My Coffee Shop')
    expect(toSiteName('/tmp/acme')).toBe('Acme')
  })
})

describe('normalizeUrl', () => {
  it('adds https and drops a trailing slash', () => {
    expect(normalizeUrl('acme.com')).toBe('https://acme.com')
    expect(normalizeUrl(' https://acme.com/ ')).toBe('https://acme.com')
    expect(normalizeUrl('http://acme.com/blog/')).toBe('http://acme.com/blog')
    expect(normalizeUrl('http://localhost:4321')).toBe('http://localhost:4321')
  })

  it('rejects what is not a public web address', () => {
    for (const input of ['', 'acme', 'ftp://acme.com', 'https://acme.com/?a=1', 'https://user@acme.com', 'not a url']) {
      expect(normalizeUrl(input), input).toBeNull()
    }
  })
})

describe('package manager', () => {
  it('detects the one that ran create', () => {
    expect(detectPackageManager('pnpm/12.14.0 npm/? node/v22.12.0 darwin arm64')).toBe('pnpm')
    expect(detectPackageManager('yarn/4.9.0 npm/? node/v22.12.0')).toBe('yarn')
    expect(detectPackageManager('bun/1.3.0 npm/? node/v22.12.0')).toBe('bun')
    expect(detectPackageManager('npm/11.6.0 node/v22.12.0')).toBe('npm')
    expect(detectPackageManager(undefined)).toBe('npm')
    expect(detectPackageManager('deno/2.0.0')).toBe('npm')
  })

  it('spells the dev command the way each one does', () => {
    expect(runCommand('npm', 'dev')).toBe('npm run dev')
    expect(runCommand('pnpm', 'dev')).toBe('pnpm dev')
    expect(runCommand('yarn', 'dev')).toBe('yarn dev')
    expect(runCommand('bun', 'dev')).toBe('bun run dev')
  })
})
