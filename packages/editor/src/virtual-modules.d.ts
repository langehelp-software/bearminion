/** The module `bearminionHostedEditor` generates: the site's editor and the sign-in mode. */
declare module 'virtual:bearminion/editor' {
  type Editor = import('./hosted-editor.js').HostedEditor
  const editor: Editor | ((context: { request: Request; locals: object }) => Editor | Promise<Editor>)
  export { editor }
  export const signIn: 'required' | 'optional'
}
