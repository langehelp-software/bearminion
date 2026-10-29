import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ContentModel } from './model.js'

/** Where a site exports its content model, the one object it passes to `bearminion()` and `loadContent()`. */
export const DEFAULT_MODEL_PATH = 'src/lib/content-model.ts'

/** The model file is missing or does not export what the editor needs. The message says what to fix. */
export class ModelError extends Error {}

/**
 * Loads the site's content model outside Astro, from its TypeScript source. It reads the section definitions of this
 * repository, so a site on an older release gets the sections it really has, not the ones the latest registry offers.
 * The file must not import `.astro` components: keep those in the files `bearminion sync` generates for the build.
 */
export async function loadContentModel(root: string, modelPath: string = DEFAULT_MODEL_PATH): Promise<ContentModel> {
  const file = path.resolve(root, modelPath)
  if (!fs.existsSync(file)) {
    throw new ModelError(
      `No content model at ${modelPath}. It is the file that exports \`contentModel\`, with the \`sections\` and \`site\` passed to bearminion(). Pass --model <file> if yours is elsewhere.`,
    )
  }
  const { createJiti } = await import('jiti')
  const jiti = createJiti(pathToFileURL(file).href, { moduleCache: false, fsCache: false, interopDefault: true })
  let loaded: Record<string, unknown>
  try {
    loaded = await jiti.import<Record<string, unknown>>(file)
  } catch (error) {
    throw new ModelError(`Could not load ${modelPath}: ${error instanceof Error ? error.message : String(error)}`)
  }
  const model = loaded.contentModel ?? loaded.default
  if (typeof model !== 'object' || model === null || !('sections' in model) || !('site' in model)) {
    throw new ModelError(`${modelPath} must export \`contentModel\` with \`sections\` and \`site\`.`)
  }
  return model as ContentModel
}
