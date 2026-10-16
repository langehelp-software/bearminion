/** Vite and the package build both load `?raw` imports as the file's text. */
declare module '*?raw' {
  const text: string
  export default text
}
