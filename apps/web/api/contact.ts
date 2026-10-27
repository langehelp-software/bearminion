// The ".js" is needed: Vercel runs this as an ES module, which does not guess file extensions. The file is contact.ts.
import form from '../src/forms/contact.js'

export const POST = (request: Request) => form.fetch(request, process.env)
export const OPTIONS = POST
