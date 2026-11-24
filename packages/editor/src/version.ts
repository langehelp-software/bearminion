declare const __BEARMINION_VERSION__: string | undefined

/** The version of this package. The build writes it in (`define` in tsdown and Vitest); source run as is says `0.0.0-dev`. */
export const VERSION: string = typeof __BEARMINION_VERSION__ === 'string' ? __BEARMINION_VERSION__ : '0.0.0-dev'
