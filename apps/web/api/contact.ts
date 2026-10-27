import form from '../src/forms/contact'

export const POST = (request: Request) => form.fetch(request, process.env)
export const OPTIONS = POST
