import path from 'node:path'
import { isAssetPath } from './asset-paths.js'
import { isInside } from './security.js'

export { assetRefs, describePageRef, describeSiteRef, isAssetPath, missingAssetIssues } from './asset-paths.js'
export type { AssetRef } from './asset-paths.js'

/**
 * Where an image path may live on disk: under `src/assets` or the uploads directory. The absolute path, or null
 * when the path is not an image path or leaves those folders.
 */
export function assetFile(root: string, uploadsDir: string, src: string): string | null {
  if (!isAssetPath(src)) return null
  const absolute = path.resolve(root, src)
  return isInside(path.resolve(root, 'src/assets'), absolute) || isInside(uploadsDir, absolute) ? absolute : null
}
