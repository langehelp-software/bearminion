import { cva, type VariantProps } from 'class-variance-authority'

export const typography = cva('text-balance', {
  variants: {
    size: {
      xs: 'text-xs',
      sm: 'text-sm',
      md: 'text-base',
      lg: 'text-lg',
      xl: 'text-xl',
      '2xl': 'text-2xl',
      '3xl': 'text-3xl',
      '4xl': 'text-4xl',
      '5xl': 'text-5xl',
      '6xl': 'text-6xl',
      display: 'font-sans text-[clamp(2.75rem,1.4rem+5.6cqi,5.75rem)] leading-[0.95] font-semibold tracking-[-0.045em]',
      'display-center':
        'mx-auto max-w-[16ch] font-sans text-[clamp(2.75rem,1.2rem+6.6cqi,7rem)] leading-[0.93] font-semibold tracking-[-0.05em]',
      'display-editorial': 'font-sans text-[clamp(3.25rem,0.5rem+11cqi,10.5rem)] leading-[0.86] font-semibold tracking-[-0.06em]',
      h2: 'font-sans text-[clamp(2rem,1.2rem+3.4cqi,3.75rem)] leading-none font-semibold tracking-[-0.04em]',
      'h2-md': 'font-sans text-[clamp(2.25rem,1.3rem+3.6cqi,4rem)] leading-[0.98] font-semibold tracking-[-0.045em]',
      'h2-lg': 'font-sans text-[clamp(2.25rem,1.2rem+4.4cqi,4.75rem)] leading-[0.95] font-semibold tracking-[-0.05em]',
      h3: 'font-sans text-[1.25rem] leading-[1.25] font-semibold tracking-[-0.02em]',
      lead: 'text-pretty font-sans text-[clamp(1.0625rem,1rem+0.35cqi,1.25rem)] leading-[1.55]',
      body: 'text-pretty font-sans text-[0.9375rem] leading-[1.6]',
      small: 'font-sans text-[0.875rem] leading-[1.5]',
      meta: 'font-sans text-[0.8125rem] leading-[1.5]',
      eyebrow: 'font-mono text-[0.75rem] tracking-[0.08em] uppercase',
      mono: 'font-mono text-[0.75rem] tracking-[0.04em]',
      stat: 'font-sans text-[clamp(3rem,2rem+4cqi,5.5rem)] leading-[0.9] font-semibold tracking-[-0.05em]',
    },
    color: {
      default: 'text-fg',
      muted: 'text-muted',
      accent: 'text-accent',
      link: 'text-link',
      on: 'text-on',
    },
    weight: {
      regular: 'font-normal',
      medium: 'font-medium',
      semibold: 'font-semibold',
      bold: 'font-bold',
    },
    font: {
      sans: 'font-sans',
      serif: 'font-serif',
      mono: 'font-mono',
    },
    align: {
      left: 'text-left',
      center: 'text-center',
      right: 'text-right',
    },
  },
  // No default weight or font: the size already sets them (headings are semibold, eyebrows mono), and a default here
  // would be merged in after the size and override it.
  defaultVariants: {
    size: 'body',
    color: 'default',
  },
})

export type TypographyVariants = VariantProps<typeof typography>
