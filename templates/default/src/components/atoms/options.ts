import type { Option } from 'bearminion'

/**
 * This theme's atom vocabulary: button roles and sizes, typography sizes and colors. Storybook controls read it.
 * It belongs to the theme, not to bearminion: section JSON never stores these, the section components pick them.
 */
export const buttonVariants = ['primary', 'secondary', 'strong', 'ghost', 'text'] as const
export const buttonSizes = ['sm', 'md', 'lg'] as const
export type ButtonVariant = (typeof buttonVariants)[number]
export type ButtonSize = (typeof buttonSizes)[number]

export const typographySizes = [
  'display',
  'display-center',
  'display-editorial',
  'h2',
  'h2-lg',
  'h3',
  'lead',
  'body',
  'small',
  'meta',
  'eyebrow',
  'mono',
  'stat',
] as const
export const typographyColors = ['default', 'muted', 'accent', 'link', 'on'] as const

export const atomOptions = {
  button: [
    { name: 'variant', label: 'Variant', type: 'enum', choices: buttonVariants, default: 'primary' },
    { name: 'size', label: 'Size', type: 'enum', choices: buttonSizes, default: 'md' },
    { name: 'arrow', label: 'Arrow', type: 'boolean', default: false },
  ],
  typography: [
    { name: 'size', label: 'Size', type: 'enum', choices: typographySizes, default: 'body' },
    { name: 'color', label: 'Color', type: 'enum', choices: typographyColors, default: 'default' },
  ],
} as const satisfies Record<string, readonly Option[]>
