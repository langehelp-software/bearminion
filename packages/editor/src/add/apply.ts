import fs from 'node:fs'
import path from 'node:path'
import { syncSections } from '../sections-manifest.js'
import type { Registry } from '../registry/types.js'
import { recordFiles, readLock, writeLock } from './lock.js'
import { writesFile, type Plan } from './plan.js'

export const SECTIONS_PATH = 'src/components/sections'

/**
 * Writes what the plan says, then lists the new directories in the generated section files and records the files in
 * the lock. Returns the paths written. A plan with conflicts is never applied.
 */
export function applyPlan(root: string, registryDir: string, registry: Registry, plan: Plan): string[] {
  if (plan.files.some((file) => file.action === 'conflict')) throw new Error('The plan has conflicts. Nothing was written.')
  const written: string[] = []
  for (const file of plan.files) {
    if (!writesFile(file.action)) continue
    const target = path.join(root, file.path)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(path.join(registryDir, 'files', file.path), target)
    written.push(file.path)
  }
  syncSections(path.join(root, SECTIONS_PATH))
  const lock = recordFiles(
    readLock(root, registry.template),
    registry,
    plan.files.map((file) => file.path),
  )
  writeLock(root, lock)
  return written
}
