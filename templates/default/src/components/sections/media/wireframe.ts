import { defineWireframe } from 'bearminion'

/** Add section picker thumbnail: [left %, top %, width %, height %, kind]. */
export const mediaWireframe = defineWireframe([
  [32, 8, 36, 7, 'title'],
  [26, 19, 48, 4, 'text'],
  [14, 30, 72, 60, 'figure'],
  [44, 52, 12, 16, 'dark'],
])
