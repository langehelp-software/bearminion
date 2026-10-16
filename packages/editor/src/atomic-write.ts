import { mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { stableStringify } from './stable-json.js'

/**
 * Write text by creating a sibling temp file and renaming it over the target.
 * The temp name does not end in `.json`, so the dev watcher does not reload
 * halfway through the write.
 */
export async function writeTextAtomic(filePath: string, text: string): Promise<void> {
  const directory = path.dirname(filePath)
  await mkdir(directory, { recursive: true })
  const tempPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`,
  )
  try {
    await writeFile(tempPath, text, 'utf8')
    await rename(tempPath, filePath)
  } catch (error) {
    // The temp file was never created, or the rename already moved it.
    await unlink(tempPath).catch(() => undefined)
    throw error
  }
}

export function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  return writeTextAtomic(filePath, stableStringify(value))
}
