import { validReflowTranslation, type Paragraph } from './types'

type Translate = (text: string, signal?: AbortSignal) => Promise<string>

/** Motif's protected-spans fallback: keep formula/style boundaries outside the model. */
export async function translateParagraph(paragraph: Paragraph, translate: Translate, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted()
  const translated = await translate(paragraph.protectedText, signal)
  signal.throwIfAborted()
  if (validReflowTranslation(paragraph, translated)) return translated

  const parts = paragraph.protectedText.split(/(⟪(?:F|\/?S)\d+⟫)/u)
  const cache = new Map<string, string>()
  for (const [index, part] of parts.entries()) {
    signal.throwIfAborted()
    if (/^⟪(?:F|\/?S)\d+⟫$/u.test(part) || !/\p{L}/u.test(part)) continue
    const leading = part.match(/^[\s.,;:!?。；，：！？)\]]*/u)?.[0] ?? ''
    const trailing = part.match(/\s*$/u)?.[0] ?? ''
    const source = part.slice(leading.length, part.length - trailing.length)
    if (!source) continue
    let result = cache.get(source)
    if (result === undefined) {
      result = await translate(source, signal)
      signal.throwIfAborted()
      if (!result.trim() || /⟪(?:F|\/?S)\d+⟫/u.test(result)) throw new Error('The model returned an invalid protected text fragment')
      cache.set(source, result.trim())
    }
    parts[index] = leading + result.trim() + trailing
  }
  const restored = parts.join('')
  if (!validReflowTranslation(paragraph, restored)) throw new Error('PDF formula or style structure could not be restored')
  return restored
}
