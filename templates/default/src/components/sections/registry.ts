import type { SectionType } from './definitions'
import Contact from './contact/Contact.astro'
import Cta from './cta/Cta.astro'
import Faq from './faq/Faq.astro'
import Features from './features/Features.astro'
import Hero from './hero/Hero.astro'
import LogoStrip from './logo-strip/LogoStrip.astro'
import Media from './media/Media.astro'
import Pricing from './pricing/Pricing.astro'
import Stats from './stats/Stats.astro'
import Steps from './steps/Steps.astro'
import Testimonials from './testimonials/Testimonials.astro'
import TextImage from './text-image/TextImage.astro'
import Video from './video/Video.astro'

/** Maps a content section `type` to the component that renders it. Definitions live in `definitions.ts`. */
export const sectionComponents = {
  hero: Hero,
  logoStrip: LogoStrip,
  steps: Steps,
  features: Features,
  textImage: TextImage,
  stats: Stats,
  testimonials: Testimonials,
  pricing: Pricing,
  video: Video,
  media: Media,
  faq: Faq,
  cta: Cta,
  contact: Contact,
} satisfies Record<SectionType, unknown>
