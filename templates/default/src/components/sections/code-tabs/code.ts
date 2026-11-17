/** One line of a code sample: its number, the code, and a trailing comment drawn apart. */
export interface CodeLine {
  n: number
  code: string
  note: string
}

/**
 * Splits a sample into lines and pulls a trailing comment off each: a line that starts with `//` or `#` is all
 * comment, and otherwise `  // note` or `  # note` (two spaces first, so `a#b` and URLs stay code) ends the code.
 */
export function codeLines(source: string): CodeLine[] {
  return source
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line, index) => {
      const trimmed = line.trimStart()
      let at = -1
      if (trimmed.startsWith('//') || trimmed.startsWith('# ')) at = line.length - trimmed.length
      else {
        const slash = line.indexOf('  // ')
        const hash = line.indexOf('  # ')
        at = [slash, hash].filter((value) => value > -1).sort((a, b) => a - b)[0] ?? -1
      }
      return { n: index + 1, code: at > -1 ? line.slice(0, at) : line, note: at > -1 ? line.slice(at) : '' }
    })
}
