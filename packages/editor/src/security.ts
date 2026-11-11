import path from 'node:path'
import { fileURLToPath } from 'node:url'
export * from './request-guards.js'

export function asDirectory(root: string | URL): string {
  if (root instanceof URL) {
    return fileURLToPath(root)
  }
  if (root.startsWith('file:')) {
    return fileURLToPath(root)
  }
  return path.resolve(root)
}

export function resolveDir(root: string, value: string | undefined, fallback: string): string {
  const chosen = value ?? fallback
  return path.isAbsolute(chosen) ? path.resolve(chosen) : path.resolve(root, chosen)
}

/** True when `candidate` is `root` or a path inside it. */
export function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate))
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

/** Resolve `parts` under `root`, or return null when the result escapes `root`. */
export function resolveInside(root: string, ...parts: string[]): string | null {
  const target = path.resolve(root, ...parts)
  return isInside(root, target) ? target : null
}
