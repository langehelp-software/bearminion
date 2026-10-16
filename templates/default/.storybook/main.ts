import type { StorybookConfig } from '@storybook-astro/framework'

const config = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  framework: {
    name: '@storybook-astro/framework',
    options: {},
  },
  core: {
    disableTelemetry: true,
  },
} satisfies StorybookConfig

export default config
