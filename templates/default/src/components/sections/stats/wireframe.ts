import { defineWireframe } from 'bearminion'

/** Add section picker thumbnail: [left %, top %, width %, height %, kind]. */
export const statsWireframe = defineWireframe([
  [0, 0, 100, 100, 'dark'],
  [8, 16, 30, 7, 'light'],
  [8, 50, 16, 14, 'figure'],
  [31, 50, 16, 14, 'figure'],
  [54, 50, 16, 14, 'figure'],
  [77, 50, 16, 14, 'figure'],
  [8, 70, 18, 4, 'text'],
  [31, 70, 18, 4, 'text'],
  [54, 70, 18, 4, 'text'],
  [77, 70, 18, 4, 'text'],
])
