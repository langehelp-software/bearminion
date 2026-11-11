/*
 * The editor API for a place that is not a developer's machine: a Worker, a serverless function. Web-standard APIs
 * only, no Node imports (a test keeps it that way).
 *
 * - `createHostedEditor`: sign-in with a GitHub App in front of the editor API; each request runs on the signed-in
 *   person's own GitHub token. The usual way in.
 * - `createHostedContext` and `handleHostedRequest`: the editor API alone, when you do the signing in yourself.
 */
export * from './hosted-context.js'
export { EDITOR_SCRIPT_PATH, type HostedEditor, type HostedEditorConfig, createHostedEditor } from './hosted-editor.js'
export { AUTH_PREFIX, type HostedAuth, type HostedAuthOptions, type HostedSession, createHostedAuth } from './hosted-auth.js'
