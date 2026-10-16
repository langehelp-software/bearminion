import { defineWireframe } from 'bearminion'

/** Add section picker thumbnail: [left %, top %, width %, height %, kind]. */
export const pricingWireframe = defineWireframe([
  [30, 8, 40, 8, 'title'],
  [8, 26, 26, 66, 'card'],
  [37, 22, 26, 72, 'highlight'],
  [66, 26, 26, 66, 'card'],
  [11, 34, 10, 4, 'text'],
  [40, 30, 10, 4, 'text'],
  [69, 34, 10, 4, 'text'],
  [11, 44, 14, 9, 'title'],
  [40, 40, 14, 9, 'title'],
  [69, 44, 14, 9, 'title'],
  [11, 78, 20, 8, 'outline'],
  [40, 78, 20, 9, 'button'],
  [69, 78, 20, 8, 'outline'],
])
