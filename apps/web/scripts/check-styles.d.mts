export function unescapeClass(name: string): string
export function classesInCss(css: string): Set<string>
export function usesClass(text: string, name: string): boolean
export function missingClasses(
  templateCss: string,
  siteCss: string,
  sources: readonly { path: string; text: string }[],
): { name: string; file: string }[]
