import type { ReflowFonts } from './layout'
import type { FontKey } from './types'

export const fontFamily = '"Noto Serif CJK SC", "Songti SC", "SimSun", serif'
export function fontCss(key: FontKey, size: number): string {
  return `${key.toLowerCase().includes('italic') ? 'italic ' : ''}${key.toLowerCase().includes('bold') ? '700 ' : '400 '}${size}px ${fontFamily}`
}

/** Measure the same browser font that paints the page overlay. No font download required. */
export function browserReflowFonts(): ReflowFonts {
  const context = document.createElement('canvas').getContext('2d')
  if (!context) throw new Error('Canvas text measurement is unavailable')
  return Object.fromEntries((['regular', 'bold', 'italic', 'boldItalic', 'cjk', 'cjkBold'] as const).map(key => [key, {
    encodeText: (text: string) => text,
    widthOfTextAtSize(text: string, size: number) { context.font = fontCss(key, size); return context.measureText(text).width },
    heightAtSize(size: number, options?: { descender: boolean }) {
      context.font = fontCss(key, size)
      const metrics = context.measureText('Mg国')
      return Math.max(size * 0.8, metrics.actualBoundingBoxAscent) + (options?.descender === false ? 0 : Math.max(size * 0.2, metrics.actualBoundingBoxDescent))
    },
  }])) as ReflowFonts
}
