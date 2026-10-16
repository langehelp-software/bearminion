import { cva, type VariantProps } from 'class-variance-authority'

export const image = cva('max-w-full', {
  variants: {
    aspect: {
      auto: '',
      square: 'aspect-square',
      video: 'aspect-video',
      '4/3': 'aspect-[4/3]',
      '4/5': 'aspect-[4/5]',
      '3/2': 'aspect-[3/2]',
    },
    fit: {
      cover: 'object-cover',
      contain: 'object-contain',
    },
    rounded: {
      none: 'rounded-none',
      md: 'rounded-md',
      lg: 'rounded-lg',
      xl: 'rounded-xl',
      '2xl': 'rounded-2xl',
      '3xl': 'rounded-[2rem]',
      full: 'rounded-full',
    },
  },
  defaultVariants: {
    aspect: 'auto',
    fit: 'cover',
    rounded: 'none',
  },
})

export type ImageVariants = VariantProps<typeof image>
