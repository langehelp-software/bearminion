export function bumpOf(changeset: string): 'major' | 'minor' | 'patch' | null
export function nextVersion(current: string, bumps: readonly string[]): string
export function badgeFor(version: string): string
export function badgeTag(indexJson: string): string | null
export function staleStrings(text: string, allowed?: readonly string[]): string[]
export function check(root: string): string[]
