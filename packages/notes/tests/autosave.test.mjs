import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createAutosaveQueue } from '../src/client/autosave-queue.ts'

test('leaving flushes latest pending text to its original path', async () => {
  const writes = []
  const old = createAutosaveQueue('papers/old/NOTES.md', async (...args) => { writes.push(args) }, () => {})
  old.schedule('first')
  old.schedule('latest')
  await old.flush()
  assert.deepEqual(writes, [['papers/old/NOTES.md', 'latest']])
})

test('slow writes finish before newer text is written', async () => {
  const writes = []
  let release
  const first = new Promise(resolve => { release = resolve })
  const queue = createAutosaveQueue('notes/a.md', async (_path, text) => {
    if (text === 'first') await first
    writes.push(text)
  }, () => {})
  queue.schedule('first')
  const a = queue.flush()
  await Promise.resolve()
  queue.schedule('latest')
  const b = queue.flush()
  assert.deepEqual(writes, [])
  release()
  await Promise.all([a, b])
  assert.deepEqual(writes, ['first', 'latest'])
})

test('failed save reports failure and does not block a later retry', async () => {
  let count = 0
  const results = []
  const queue = createAutosaveQueue('notes/a.md', async () => {
    if (++count === 1) throw new Error('offline')
  }, error => results.push(error?.message ?? 'saved'))
  queue.schedule('text')
  await queue.flush()
  queue.schedule('text')
  await queue.flush()
  assert.deepEqual(results, ['offline', 'saved'])
})

test('reopening waits for the previous editor and shares write ordering', async () => {
  const { waitForAutosave } = await import('../src/client/autosave-queue.ts')
  const writes = []
  let release
  const first = new Promise(resolve => { release = resolve })
  const write = async (_path, text) => {
    if (text === 'old editor') await first
    writes.push(text)
  }
  const old = createAutosaveQueue('papers/p/NOTES.md', write, () => {})
  old.schedule('old editor')
  void old.flush()
  let readable = false
  const reading = waitForAutosave('papers/p/NOTES.md', write).then(() => { readable = true })
  const next = createAutosaveQueue('papers/p/NOTES.md', write, () => {})
  next.schedule('new editor')
  const saving = next.flush()
  await Promise.resolve()
  assert.equal(readable, false)
  assert.deepEqual(writes, [])
  release()
  await Promise.all([reading, saving])
  assert.deepEqual(writes, ['old editor', 'new editor'])
})
