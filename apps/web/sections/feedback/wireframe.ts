import { defineWireframe } from 'bearminion'

/** Add section picker thumbnail: [left %, top %, width %, height %, kind]. */
export const feedbackWireframe = defineWireframe([
  [6, 14, 18, 4, 'text'],
  [6, 22, 36, 14, 'title'],
  [6, 40, 32, 6, 'text'],
  [6, 52, 38, 12, 'dark'],
  [6, 68, 38, 12, 'card'],
  [52, 14, 42, 72, 'card'],
  [56, 26, 4, 6, 'dark'],
  [63, 26, 26, 5, 'title'],
  [56, 42, 4, 6, 'outline'],
  [63, 42, 22, 5, 'title'],
  [56, 58, 4, 6, 'outline'],
  [63, 58, 24, 5, 'title'],
])
