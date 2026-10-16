import { cva, type VariantProps } from 'class-variance-authority'

export const button = cva(
  'inline-flex items-center justify-center gap-2 rounded-full font-medium transition-[filter,transform,box-shadow,background-color,color] duration-200',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-on hover:brightness-[0.94]',
        secondary: 'bg-transparent text-fg shadow-[inset_0_0_0_1px_var(--line)] hover:shadow-[inset_0_0_0_1px_var(--fg)]',
        strong: 'bg-fg text-bg hover:-translate-y-px',
        ghost: 'bg-transparent text-fg hover:bg-line',
        text: 'h-auto rounded-none bg-transparent p-0 text-[0.9375rem] text-link underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-10 px-4 text-[0.9375rem]',
        md: 'h-12 px-[1.375rem] text-[0.9375rem]',
        lg: 'h-[3.25rem] px-6 text-[0.9375rem]',
      },
    },
    compoundVariants: [
      { variant: 'text', class: 'h-auto px-0' },
      { variant: 'ghost', class: 'px-4' },
    ],
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
)

export type ButtonVariants = VariantProps<typeof button>
