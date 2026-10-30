import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTranslator } from '../lib/translate.js'
import { translateDocumentText, normalizeTranslationSource } from '../lib/translation/pipeline.js'
import { maskInlineTokens, restoreInlineTokens } from '../lib/translation/mask.js'
import { splitTranslationChunks } from '../lib/translation/chunks.js'
import { parseNumberedTranslation } from '../lib/translation/batches.js'
import { buildTranslateMessages } from '../lib/translation/prompt.js'
import { writeMark, readMarks } from '../lib/marks-store.js'

const signal = () => new AbortController().signal
const settings = { translationProvider: '', translationModel: '' }
function mockLlm(chunks, inspect = () => {}) {
  return { async prepareCall(config, signal, configure) {
    const controls = configure(config, { reasoning: { efforts: [{ id: 'off' }, { id: 'high' }] } })
    return { config: { ...config, ...controls }, async *stream(options) { inspect(options); yield* chunks } }
  } }
}
const defaultModel = { currentSelection: () => ({ provider: 'deepseek', model: 'test-model', reasoningEffort: 'high' }) }

test('Harness route, low reasoning, source-only request and authoritative text blocks', async () => {
  const llm = mockLlm([
    { type: 'text-delta', index: 1, text: '译文' },
    { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'private thoughts' } },
    { type: 'block-end', index: 1, block: { type: 'text', text: '译文' } },
    { type: 'finish', reason: { kind: 'stop' } },
  ], options => {
    assert.equal(options.provider, 'deepseek'); assert.equal(options.reasoningEffort, 'off')
    assert.equal(options.temperature, 0.2); assert.equal(options.messages.length, 1)
    assert.equal(options.messages[0].content[0].text, '"""attention"""')
    assert.equal(options.tools, undefined); assert.equal(options.sessionId, undefined)
  })
  assert.equal(await createTranslator(settings, () => llm, () => defaultModel)('attention', 'zh-CN', signal()), '译文')
})

test('reject partial, reasoning-only, failed or unterminated streams', async () => {
  for (const end of [undefined, 'max-tokens', 'error', 'aborted', 'tool-calls']) {
    const chunks = [{ type: 'block-end', index: 0, block: { type: 'text', text: 'partial' } }]
    if (end) chunks.push({ type: 'finish', reason: { kind: end } })
    await assert.rejects(createTranslator(settings, () => mockLlm(chunks), () => defaultModel)('word', 'zh', signal()))
  }
  await assert.rejects(createTranslator(settings, () => mockLlm([{ type: 'finish', reason: { kind: 'stop' } }]), () => defaultModel)('word', 'zh', signal()), /no translation/)
})

test('configuration and cancellation stop requests before dispatch', async () => {
  await assert.rejects(createTranslator({ ...settings, translationProvider: 'x' }, () => undefined, () => defaultModel)('word', 'zh', signal()), /together/)
  await assert.rejects(createTranslator(settings, () => undefined, () => undefined)('word', 'zh', signal()), /default model/)
  const controller = new AbortController(); controller.abort()
  await assert.rejects(createTranslator(settings, () => ({ prepareCall() { assert.fail('dispatched') } }), () => defaultModel)('word', 'zh', controller.signal), { name: 'AbortError' })
})

test('protected links, TeX, literal placeholders and style markers restore exactly', () => {
  const input = 'See [2], [paper](https://a.test/x_(y)), $x + y$, ⟦0⟧ and ⟪F0⟫ ⟪S0⟫bold⟪/S0⟫.'
  const masked = maskInlineTokens(input)
  assert.equal(restoreInlineTokens(masked.text, masked.tokens).text, input)
  assert.equal(restoreInlineTokens(masked.text + masked.tokens[0].placeholder, masked.tokens).invalid, true)
  assert.ok(restoreInlineTokens('', masked.tokens).missing > 0)
  assert.equal(restoreInlineTokens('⟦999⟧', masked.tokens).invalid, true)
})

test('chunks are lossless and never split surrogate pairs or placeholders', () => {
  const text = 'a'.repeat(30) + '⟦12345⟧😀' + 'b'.repeat(70)
  const chunks = splitTranslationChunks(text, 32)
  assert.equal(chunks.join(''), text)
  for (const chunk of chunks) { assert.ok(!/[\uD800-\uDBFF]$/.test(chunk)); assert.ok(!/⟦[^⟧]*$/.test(chunk)) }
})

test('strict markers fall back to individual sentences without losing order', async () => {
  assert.equal(parseNumberedTranslation('[[2]] second [[1]] first', 2), null)
  const calls = []
  const output = await translateDocumentText('First sentence. Second sentence.', 'zh', async text => {
    calls.push(text)
    if (text.startsWith('[[1]]')) return 'bad markers'
    return text.startsWith('First') ? '第一句。' : '第二句。'
  }, signal())
  assert.equal(output, '第一句。第二句。'); assert.equal(calls.length, 3)
})

test('damaged protection repairs through aliases, then protected prose spans', async () => {
  let count = 0
  const output = await translateDocumentText('Use $x+y$ here.', 'zh', async text => {
    count++
    if (/⟦|ZXQ/.test(text)) return 'lost token'
    return text.includes('Use') ? '使用' : '此处。'
  }, signal())
  assert.ok(output.includes('$x+y$')); assert.equal(count, 5)
})

test('transport truncation splits smaller; authentication errors are not retried', async () => {
  let calls = 0
  const input = 'A long paragraph without punctuation '.repeat(6).trim()
  const output = await translateDocumentText(input, 'en', async text => {
    calls++
    if (text.length > 120) throw Object.assign(new Error('truncated'), { code: 'TRANSLATION_INCOMPLETE' })
    return text
  }, signal())
  assert.equal(output.replace(/\s+/g, ' '), input); assert.ok(calls > 1)
  calls = 0
  await assert.rejects(translateDocumentText(input, 'en', async () => { calls++; throw new Error('AUTH') }, signal()), /AUTH/)
  assert.equal(calls, 1)
})

test('PDF normalization and custom style keep engine constraints', () => {
  assert.equal(normalizeTranslationSource('ﬁne repre- sentation pre- and post-training'), 'fine representation pre- and post-training')
  const message = buildTranslateMessages({ text: 'attention', targetLangName: 'Chinese', customSystem: '翻译得自然一点' })
  assert.ok(message.system.includes('Additional preference')); assert.ok(message.system.includes('OUTPUT ONLY'))
  const custom = buildTranslateMessages({ text: '$a', targetLangName: 'Chinese', customUser: '{{text}} / {{text}}' })
  assert.equal(custom.user, '$a / $a')
})

test('translated marks persist motif geometry and result', async () => {
  const vault = await mkdtemp(join(tmpdir(), 'translation-mark-'))
  try {
    await mkdir(join(vault, 'papers/p'), { recursive: true })
    const result = await writeMark(vault, { ref: 'papers/p', kind: 'translate', quote: 'Source', result: '译文', page: 1, rects: [{ x: 10, y: 20, w: 30, h: 40 }], pageSize: { width: 100, height: 200 } })
    assert.equal(result.ok, true)
    const stored = JSON.parse(await readFile(join(vault, result.path), 'utf8'))
    assert.equal(stored.result, '译文'); assert.deepEqual(stored.rects, [{ x: .1, y: .1, w: .3, h: .2 }])
    const read = await readMarks(vault, 'papers/p'); assert.equal(read.marks[0].note, '译文')
  } finally { await rm(vault, { recursive: true, force: true }) }
})

test('transient translation failures retry twice with bounded backoff', async () => {
  const { retryTranslation } = await import('../lib/translation/retry.js')
  const delays = []
  let calls = 0
  const value = await retryTranslation(async () => {
    if (++calls < 3) throw Object.assign(new Error('busy'), { status: 429 })
    return '译文'
  }, signal(), async ms => { delays.push(ms) })
  assert.equal(value, '译文')
  assert.equal(calls, 3)
  assert.deepEqual(delays, [1000, 2000])
  calls = 0
  await assert.rejects(retryTranslation(async () => {
    calls++; throw new TypeError('fetch failed')
  }, signal(), async () => {}), /fetch failed/)
  assert.equal(calls, 3)
})

test('terminal failures and cancellation never consume retries', async () => {
  const { retryTranslation } = await import('../lib/translation/retry.js')
  for (const error of [Object.assign(new Error('denied'), { status: 401 }), new Error("unexpected argument '-t' found"), Object.assign(new Error('truncated'), { code: 'TRANSLATION_INCOMPLETE' })]) {
    let calls = 0
    await assert.rejects(retryTranslation(async () => { calls++; throw error }, signal(), async () => assert.fail('wait')))
    assert.equal(calls, 1)
  }
  const controller = new AbortController()
  let calls = 0
  await assert.rejects(retryTranslation(async () => { calls++; throw new Error('network failure') }, controller.signal, async () => { controller.abort() }), { name: 'AbortError' })
  assert.equal(calls, 1)
})
