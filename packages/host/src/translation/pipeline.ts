/** Motif's protection, sentence batching and repair flow, shared by page reflow and selection translation. */
import { buildNumberedPayload, buildTranslateBatches, parseNumberedTranslation } from './batches.js'
import { splitTranslationChunks } from './chunks.js'
import { maskInlineTokens, restoreInlineTokens, type MaskedToken } from './mask.js'
import { splitLayoutSentences } from './sentences.js'

/** Heal PDF ligatures and wrapped words without deleting unclassified page content. */
export function normalizeTranslationSource(raw: string): string {
  const ligatures: Record<string, string> = { 'ﬀ': 'ff', 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬃ': 'ffi', 'ﬄ': 'ffl', 'ﬅ': 'st', 'ﬆ': 'st' }
  return raw.normalize('NFC').replace(/\u00ad/gu, '')
    .replace(/[ﬀﬁﬂﬃﬄﬅﬆ]/gu, hit => ligatures[hit] ?? hit)
    .replace(/(\p{Ll})[-\u2010\u2011\u2012\u2013]\s+(\p{Ll}+)/gu, (full, head: string, tail: string) =>
      /^(?:and|or|nor|but|to|vs|versus|per|than)$/iu.test(tail) ? full : `${head}${tail}`)
    .replace(/[^\S\n]+/gu, ' ').trim()
}

interface Unit {
  source: string
  paragraph: number
  tokens: MaskedToken[]
  index: number
}

function restore(text: string, tokens: MaskedToken[]): string | undefined {
  const value = restoreInlineTokens(text, tokens)
  return value.missing === 0 && !value.invalid && value.text.trim() !== '' ? value.text.trim() : undefined
}

/** Alphabetic aliases avoid models interpreting a numeric placeholder as a value. */
function aliasFor(index: number): string {
  return `ZXQ${index.toString(26).replace(/[0-9a-p]/gu, c => String.fromCharCode(65 + Number.parseInt(c, 26)))}QXZ`
}

export async function translateDocumentText(
  input: string,
  target: string,
  translate: (text: string) => Promise<string>,
  signal: AbortSignal,
): Promise<string> {
  // Mask before normalization and sentence cutting so formulas and URLs stay byte-exact.
  const masked = maskInlineTokens(input)
  const paragraphs = normalizeTranslationSource(masked.text).split(/\n\s*\n/gu).filter(part => part.trim() !== '')
  const units: Unit[] = []
  for (const [paragraph, text] of paragraphs.entries()) {
    for (const sentence of splitLayoutSentences(text)) {
      for (const source of splitTranslationChunks(sentence, 2200)) {
        units.push({ source, paragraph, index: units.length,
          tokens: masked.tokens.filter(token => source.includes(token.placeholder)) })
      }
    }
  }
  const output = new Array<string>(units.length)
  const call = async (source: string): Promise<string> => {
    signal.throwIfAborted()
    const result = await translate(source)
    signal.throwIfAborted()
    return result
  }
  const gap = /^zh(?:-|$)/iu.test(target) ? '' : ' '
  const incomplete = (error: unknown): boolean => error instanceof Error
    && 'code' in error && error.code === 'TRANSLATION_INCOMPLETE'
  const callUnit = async (source: string, depth = 0): Promise<string> => {
    try { return await call(source) }
    catch (error) {
      signal.throwIfAborted()
      if (!incomplete(error) || depth >= 2 || source.length < 64) throw error
      const parts: string[] = []
      for (const part of splitTranslationChunks(source, Math.max(32, Math.ceil(source.length / 2)))) {
        parts.push(await callUnit(part, depth + 1))
      }
      return parts.join(gap)
    }
  }
  const finalize = async (unit: Unit, candidate: string): Promise<string> => {
    const restored = restore(candidate, unit.tokens)
    if (restored !== undefined) return restored
    const retry = restore(await callUnit(unit.source), unit.tokens)
    if (retry !== undefined) return retry

    const aliases = unit.tokens.map((token, index) => ({ ...token, alias: aliasFor(index) }))
    let alternate = unit.source
    for (const token of aliases) alternate = alternate.replaceAll(token.placeholder, token.alias)
    alternate = await callUnit(alternate)
    for (const token of aliases) alternate = alternate.replace(new RegExp(token.alias, 'gi'), token.placeholder)
    const repaired = restore(alternate, unit.tokens)
    if (repaired !== undefined) return repaired

    // Last resort from motif: translate only prose between protected spans.
    const parts = unit.source.split(/(⟦\d+⟧)/u)
    for (const [index, part] of parts.entries()) {
      if (/^⟦\d+⟧$/u.test(part) || !/\p{L}/u.test(part)) continue
      const leading = part.match(/^[\s.,;:!?。；，：！？)\]]*/u)?.[0] ?? ''
      const translated = await callUnit(part.slice(leading.length))
      // No token was sent in this fragment: invented placeholders are a failure.
      if (/⟦\s*\d+\s*⟧/u.test(translated)) throw new Error('Translation changed protected formulas or links. Please retry.')
      parts[index] = leading + translated
    }
    const protectedResult = restore(parts.join(' '), unit.tokens)
    if (protectedResult === undefined) throw new Error('Translation changed protected formulas or links. Please retry.')
    return protectedResult
  }
  // Serial batches keep repair requests bounded and avoid amplifying provider rate limits.
  for (const batch of buildTranslateBatches(units)) {
    signal.throwIfAborted()
    let segments: string[] | null
    try {
      const result = batch.length === 1 ? await callUnit(batch[0]!.source) : await call(buildNumberedPayload(batch))
      segments = parseNumberedTranslation(result, batch.length)
    } catch (error) {
      signal.throwIfAborted()
      if (!incomplete(error) || batch.length === 1) throw error
      segments = null
    }
    for (const [index, unit] of batch.entries()) {
      signal.throwIfAborted()
      const candidate = segments?.[index] ?? await callUnit(unit.source)
      output[unit.index] = await finalize(unit, candidate)
    }
  }
  signal.throwIfAborted()
  return paragraphs.map((_, paragraph) => units
    .filter(unit => unit.paragraph === paragraph)
    .map(unit => output[unit.index]).join(gap)).join('\n\n')
}
