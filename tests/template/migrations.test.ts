import { createMigrator } from '../../packages/editor/src/migrate'
import { describe, expect, it } from 'vitest'
import { migrateVideoToMedia } from '../../templates/default/src/lib/migrations'

const migrator = createMigrator({ schemaVersion: 2, migrations: { 1: migrateVideoToMedia } })

describe('version 1 to 2: Video becomes Media', () => {
  it('turns a video section into a media section of kind video', () => {
    const result = migrator.upgrade(
      {
        slug: 'index',
        sections: [
          {
            id: 'demo',
            type: 'video',
            variant: 'framed',
            tone: 'base',
            props: { heading: 'Watch', intro: 'Short.', video: '/videos/demo.webm', label: 'Demo', playback: 'loop', caption: 'Cap' },
          },
          { id: 'hero', type: 'hero', variant: 'split', tone: 'base', props: {} },
        ],
      },
      'page',
    )
    expect(result).toEqual({
      ok: true,
      value: {
        slug: 'index',
        sections: [
          {
            id: 'demo',
            type: 'media',
            variant: 'centered',
            tone: 'base',
            props: {
              heading: 'Watch',
              body: 'Short.',
              video: '/videos/demo.webm',
              label: 'Demo',
              playback: 'loop',
              caption: 'Cap',
              kind: 'video',
            },
          },
          { id: 'hero', type: 'hero', variant: 'split', tone: 'base', props: {} },
        ],
      },
    })
  })

  it('drops the placeholder link and the default playback', () => {
    const result = migrator.upgrade(
      {
        schemaVersion: 1,
        sections: [{ id: 'v', type: 'video', variant: 'wide', tone: 'base', props: { video: 'placeholder', playback: 'controls' } }],
      },
      'page',
    )
    expect(result).toEqual({
      ok: true,
      value: { sections: [{ id: 'v', type: 'media', variant: 'wide', tone: 'base', props: { kind: 'video' } }] },
    })
  })

  it('leaves site files alone', () => {
    expect(migrator.upgrade({ name: 'x' }, 'site')).toEqual({ ok: true, value: { name: 'x' } })
  })
})
