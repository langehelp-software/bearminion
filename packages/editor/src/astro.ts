/**
 * `bearminion/astro`: the server side. The dev-only Astro integration, the content store it writes through, and the
 * loaders `astro.config.ts` uses before content collections exist. Node only.
 *
 * ```ts
 * import bearminion, { loadContent } from 'bearminion/astro'
 * ```
 */
import { bearminion } from './integration.js'

export { bearminion }
export default bearminion
export type { BearminionIntegration } from './integration.js'

export type { BearminionOptions, EditorContext } from './options.js'

export { createFileStore, StoreKeyError } from './store.js'
export type { ContentStore, FileStoreOptions, StoreOperation, UploadStore } from './store.js'

export { loadContent, loadPages, loadSite } from './load.js'
export type { LoadOptions, LoadedContent } from './load.js'
