import { editor, preview, signIn } from 'virtual:bearminion/editor'
import { type HostedMiddleware, createHostedMiddleware } from './hosted-middleware.js'

/*
 * The middleware `bearminionHostedEditor` registers. The site's editor module (see the integration's `module` option) may
 * export the editor itself or a function that builds it from the first request, for hosts that hand over secrets per
 * request. Built once per server instance.
 */

let ready: Promise<HostedMiddleware> | undefined

export const onRequest = async (context: { request: Request; locals: object }, next: () => Promise<Response>): Promise<Response> => {
  ready ??= Promise.resolve(typeof editor === 'function' ? editor(context) : editor).then((built) =>
    createHostedMiddleware(built, { signIn, ...(preview ? { preview } : {}) }),
  )
  try {
    return await (await ready)(context, next)
  } catch (error) {
    // A failure while building the editor (a missing secret, say) must not stick for the life of the instance.
    ready = undefined
    throw error
  }
}
