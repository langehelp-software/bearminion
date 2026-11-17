import { z } from 'zod'
import { defineSection, richTextSchema, textSchema, withEmphasis, type CountRule } from 'bearminion'
import { accent, eyebrow, heading } from '../shared'
import { compareWireframe } from './wireframe'

export const compareVariants = ['centered', 'left'] as const

/** Two to five columns and up to twelve rows; every row has one value per column. */
export const compareCounts = {
  columns: { recommended: '3 or 4', min: 2, max: 5 },
  rows: { recommended: '4–8', min: 1, max: 12 },
} as const satisfies Record<string, CountRule>

export const compareColumnSchema = z
  .object({
    label: textSchema,
    /** On: the column stands out, for your own offer. */
    highlight: z.boolean().default(false),
  })
  .strict()

export const compareRowSchema = z
  .object({
    /** What the row compares, such as "Monthly bill". */
    label: textSchema,
    /** One value per column, in the columns' order. */
    values: z.array(textSchema).min(compareCounts.columns.min).max(compareCounts.columns.max),
  })
  .strict()

export const compareSchema = withEmphasis({
  eyebrow,
  heading,
  body: richTextSchema.optional(),
  columns: z.array(compareColumnSchema).min(compareCounts.columns.min).max(compareCounts.columns.max),
  rows: z.array(compareRowSchema).min(compareCounts.rows.min).max(compareCounts.rows.max),
  /** A line under the table: the honest caveat. */
  note: richTextSchema.optional(),
})

export type CompareColumn = z.infer<typeof compareColumnSchema>
export type CompareRow = z.infer<typeof compareRowSchema>
export type CompareProps = z.infer<typeof compareSchema>

export const compare = defineSection({
  type: 'compare',
  label: 'Compare',
  description: 'A table of options side by side, with yours highlighted.',
  schema: compareSchema,
  defaults: {
    eyebrow: 'Compared',
    heading: 'What you get, side by side.',
    marks: accent('What you get, side by side.', 'side by side.'),
    body: 'Pick the rows a buyer actually asks about. Four to eight is plenty.',
    columns: [
      { label: 'The usual way', highlight: false },
      { label: 'The expensive way', highlight: false },
      { label: 'Us', highlight: true },
    ],
    rows: [
      { label: 'Setup', values: ['A week of calls', 'A consultant', 'One afternoon'] },
      { label: 'Who runs it', values: ['Your team', 'Their team', 'Nobody, it runs itself'] },
      { label: 'Moving out', values: ['Export, then hope', 'Ask nicely', 'Take your files'] },
      { label: 'Monthly bill', values: ['Per seat', 'Per project', 'Flat'] },
    ],
    note: 'Say plainly who the other options suit better. Readers trust a table that admits something.',
  },
  variants: compareVariants,
  defaultVariant: 'centered',
  optional: { props: ['eyebrow', 'heading', 'body', 'note'] },
  counts: compareCounts,
  wireframe: compareWireframe,
  refine(section, ctx) {
    const columns = section.props.columns.length
    section.props.rows.forEach((row, rowIndex) => {
      if (row.values.length === columns) return
      ctx.addIssue({
        code: 'custom',
        path: ['props', 'rows', rowIndex, 'values'],
        message: `Row "${row.label}" has ${row.values.length} values for ${columns} columns. Give every row one value per column.`,
      })
    })
  },
})
