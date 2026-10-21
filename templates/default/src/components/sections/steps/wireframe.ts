import { defineWireframe } from 'bearminion'

/** Add section picker thumbnail: [left %, top %, width %, height %, kind]. */
export const stepsWireframe = defineWireframe([
  [8, 12, 40, 8, 'title'],
  [8, 25, 30, 4, 'text'],
  [8, 40, 26, 46, 'card'],
  [37, 40, 26, 46, 'card'],
  [66, 40, 26, 46, 'card'],
  [12, 46, 7, 9, 'highlight'],
  [41, 46, 7, 9, 'highlight'],
  [70, 46, 7, 9, 'highlight'],
  [12, 62, 16, 4, 'text'],
  [41, 62, 16, 4, 'text'],
  [70, 62, 16, 4, 'text'],
])
