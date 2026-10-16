import { defineWireframe } from 'bearminion'

/** Add section picker thumbnail: [left %, top %, width %, height %, kind]. */
export const textImageWireframe = defineWireframe([
  [8, 14, 40, 72, 'block'],
  [56, 22, 20, 5, 'text'],
  [56, 34, 34, 8, 'title'],
  [56, 50, 32, 4, 'text'],
  [56, 58, 28, 4, 'text'],
  [56, 66, 30, 4, 'text'],
  [56, 76, 14, 9, 'button'],
])
