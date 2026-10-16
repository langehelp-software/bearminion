import path from 'node:path'
import { assetRefs, isAssetPath } from './asset-paths.js'
import { isInside } from './security.js'

export { assetRefs, describePageRef, describeSiteRef, isAssetPath } from './asset-paths.js'
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

/** One validation issue per image path in `document` whose file does not exist. */
export async function missingAssetIssues(
  document: unknown,
  exists: (src: string) => Promise<boolean>,
): Promise<{ path: string; message: string }[]> {
  const refs = assetRefs(document)
  const present = await Promise.all(refs.map((ref) => exists(ref.src)))
  return refs.flatMap((ref, index) =>
    present[index] ? [] : [{ path: ref.path, message: `Image file not found: ${ref.src}. Choose another image or upload it again.` }],
  )
}
