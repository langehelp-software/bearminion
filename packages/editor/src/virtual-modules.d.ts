/** The module `bearminionHostedEditor` generates: the site's editor, the sign-in mode and the theme's preview. */
declare module 'virtual:bearminion/editor' {
  type Editor = import('./hosted-editor.js').HostedEditor
  const editor: Editor | ((context: { request: Request; locals: object }) => Editor | Promise<Editor>)
  export { editor }
  export const signIn: 'required' | 'optional'
  /** Loads the theme's preview renderer. `undefined` when the site has none. */
  export const preview: (() => Promise<import('./preview.js').ThemePreview>) | undefined
}
