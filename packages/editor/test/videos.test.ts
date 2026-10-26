import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { deleteVideo, listVideos, saveVideo, sniffVideo, videoKindFromMime } from '../src/videos.js'

const bytes = (...values: (number | string)[]) =>
  Uint8Array.from(values.flatMap((value) => (typeof value === 'number' ? [value] : [...value].map((char) => char.charCodeAt(0)))))

const MP4 = bytes(0, 0, 0, 0x18, 'ftypmp42', 0, 0, 0, 0)
const MOV = bytes(0, 0, 0, 0x14, 'ftypqt  ', 0, 0, 0, 0)
const WEBM = bytes(0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x82, 0x84, 'webm')
const MKV = bytes(0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x82, 0x88, 'matroska')
const OGG = bytes('OggS', 0, 2)
const AVIF = bytes(0, 0, 0, 0x1c, 'ftypavif', 0, 0, 0, 0)

describe('sniffVideo', () => {
  it('reads the container from the bytes', () => {
    expect(sniffVideo(MP4)).toBe('mp4')
    expect(sniffVideo(MOV)).toBe('mov')
    expect(sniffVideo(WEBM)).toBe('webm')
    expect(sniffVideo(OGG)).toBe('ogv')
  })

  it('refuses images, Matroska and anything else', () => {
    expect(sniffVideo(AVIF)).toBeNull()
    expect(sniffVideo(MKV)).toBeNull()
    expect(sniffVideo(bytes('GIF89a'))).toBeNull()
    expect(sniffVideo(new Uint8Array())).toBeNull()
  })

  it('maps declared types', () => {
    expect(videoKindFromMime('video/mp4')).toBe('mp4')
    expect(videoKindFromMime('video/webm; codecs=vp9')).toBe('webm')
    expect(videoKindFromMime('image/png')).toBeNull()
  })
})

describe('video files', () => {
  let root = ''
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true })
  })

  it('saves under a unique sniffed name, lists with its public address, and deletes', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'bm-video-'))
    const videosDir = path.join(root, 'public', 'videos')
    const saved = await saveVideo({ root, videosDir, originalName: '../My Demo!.MOV', bytes: MP4, kind: 'mp4' })
    expect(saved.filename).toMatch(/^my-demo-[0-9a-f]{8}\.mp4$/)
    expect(saved.url).toBe(`/videos/${saved.filename}`)
    expect(saved.path).toBe(`public/videos/${saved.filename}`)
    expect(await readFile(path.join(videosDir, saved.filename))).toHaveLength(MP4.length)

    expect(await listVideos(root, videosDir)).toEqual([{ filename: saved.filename, path: saved.path, url: saved.url, bytes: MP4.length }])
    expect(await deleteVideo(videosDir, '../x.mp4')).toBe(false)
    expect(await deleteVideo(videosDir, 'notes.txt')).toBe(false)
    expect(await deleteVideo(videosDir, saved.filename)).toBe(true)
    expect(await readdir(videosDir)).toEqual([])
  })
})
