/**
 * The pet's palette selection, derived from the shell theme service.
 * A tiny module-level store so the canvas component can react to theme
 * switches without threading the cordis context through slot props.
 */

/** classic = GrokBot's blue body + cream eyes; mono = black & white. */
export type GrokBotPalette = 'classic' | 'mono'

let palette: GrokBotPalette = 'classic'
const listeners = new Set<() => void>()

/** The currently selected palette. */
export function currentPalette(): GrokBotPalette {
  return palette
}

/** Subscribe to palette changes; returns the disposer. */
export function subscribePalette(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Switch the palette (no-op when unchanged). */
export function setPalette(next: GrokBotPalette): void {
  if (palette === next) return
  palette = next
  for (const listener of listeners) listener()
}

/**
 * Resolve the palette for one theme snapshot: the dark GUI scheme keeps the
 * classic blue/cream look; the light scheme switches to black & white.
 */
export function paletteOf(colorScheme: 'light' | 'dark'): GrokBotPalette {
  return colorScheme === 'dark' ? 'classic' : 'mono'
}
