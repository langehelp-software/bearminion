import { describe, expect, it } from 'vitest'
import { analyticsEnabled } from '../../templates/default/src/lib/analytics'

describe('analytics gate', () => {
  it('stays off in dev and on in a production build, with nothing configured', () => {
    expect(analyticsEnabled({}, false)).toBe(false)
    expect(analyticsEnabled({}, true)).toBe(true)
  })

  it('tells Vercel production from its previews', () => {
    expect(analyticsEnabled({ VERCEL_ENV: 'production' }, true)).toBe(true)
    expect(analyticsEnabled({ VERCEL_ENV: 'preview' }, true)).toBe(false)
    expect(analyticsEnabled({ VERCEL_ENV: 'development' }, true)).toBe(false)
  })

  it('tells Netlify production from its previews', () => {
    expect(analyticsEnabled({ NETLIFY: 'true', CONTEXT: 'production' }, true)).toBe(true)
    expect(analyticsEnabled({ NETLIFY: 'true', CONTEXT: 'deploy-preview' }, true)).toBe(false)
    expect(analyticsEnabled({ NETLIFY: 'true', CONTEXT: 'branch-deploy' }, true)).toBe(false)
  })

  it('lets BEARMINION_ANALYTICS decide, in either direction and in any spelling', () => {
    expect(analyticsEnabled({ BEARMINION_ANALYTICS: 'off' }, true)).toBe(false)
    expect(analyticsEnabled({ BEARMINION_ANALYTICS: 'FALSE' }, true)).toBe(false)
    expect(analyticsEnabled({ BEARMINION_ANALYTICS: 'on', VERCEL_ENV: 'preview' }, true)).toBe(true)
    expect(analyticsEnabled({ BEARMINION_ANALYTICS: ' 1 ' }, false)).toBe(true)
  })

  it('ignores a value it does not understand', () => {
    expect(analyticsEnabled({ BEARMINION_ANALYTICS: 'maybe' }, true)).toBe(true)
    expect(analyticsEnabled({ BEARMINION_ANALYTICS: 'maybe', VERCEL_ENV: 'preview' }, true)).toBe(false)
    expect(analyticsEnabled({ BEARMINION_ANALYTICS: '' }, false)).toBe(false)
  })
})
