/* Pure: the dev server and the hosted editor both answer a missing image with this picture. */

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (char) => `&#${char.charCodeAt(0)};`)
}

/** Striped frame with "Missing image" and the file name. Scales to any box. */
export function missingImageSvg(src: string): string {
  const name = escapeXml(src.split('/').pop() ?? src)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 300" preserveAspectRatio="xMidYMid slice">
<defs><pattern id="s" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="12" height="12" fill="#f4f1ec"/><rect width="5" height="12" fill="#ebe5dc"/></pattern></defs>
<rect width="480" height="300" fill="url(#s)"/>
<g font-family="ui-monospace, SFMono-Regular, Menlo, monospace" text-anchor="middle">
<text x="240" y="146" font-size="18" font-weight="600" fill="#b42318">Missing image</text>
<text x="240" y="172" font-size="13" fill="#6b6459">${name}</text>
</g>
</svg>`
}
