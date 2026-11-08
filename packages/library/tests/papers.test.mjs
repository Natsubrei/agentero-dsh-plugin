import assert from 'node:assert/strict'
import { test } from 'node:test'
import { filterPapers, papersFrom, setPaperRead } from '../src/client/papers.ts'

test('reads explicit boolean reading state, independently of import status', () => {
  const papers = papersFrom({ ok: true, data: [
    { id: 'read', is_read: true, status: 'completed' },
    { id: 'unread', is_read: false, status: 'completed' },
    { id: 'legacy' },
    { id: 'invalid', is_read: 'false' },
  ] })
  assert.deepEqual(papers.map(paper => paper.isRead), [true, false, null, null])
})

test('unread filter composes with search and does not classify missing fields as unread', () => {
  const papers = papersFrom({ ok: true, data: [
    { id: 'a', title: 'Attention', authors: ['Alice'], is_read: false },
    { id: 'b', title: 'Attention', authors: ['Bob'], is_read: true },
    { id: 'c', title: 'Other', authors: ['Alice'], is_read: false },
    { id: 'd', title: 'Attention' },
  ] })
  assert.equal(filterPapers(papers, '', false).length, 4)
  assert.deepEqual(filterPapers(papers, ' ATTENTION ', true).map(p => p.openId), ['a'])
  assert.deepEqual(filterPapers(papers, 'alice', true).map(p => p.openId), ['a', 'c'])
  assert.equal(filterPapers(papers, 'bob', true).length, 0)
  assert.deepEqual(papers.map(p => p.openId), ['a', 'b', 'c', 'd'])
})

test('read and unread mutations use the supplied scoped request with exact boolean values', async () => {
  const calls = []
  const request = async (url, init) => {
    calls.push({ url, init })
    return Response.json({ ok: true })
  }
  await setPaperRead('papers/论文', true, request)
  await setPaperRead('papers/论文', false, request)
  assert.deepEqual(calls.map(({ url, init }) => ({ url, method: init.method, body: JSON.parse(init.body) })), [
    { url: '/agentero/api/papers/read', method: 'POST', body: { ref: 'papers/论文', read: true } },
    { url: '/agentero/api/papers/read', method: 'POST', body: { ref: 'papers/论文', read: false } },
  ])
})

test('read mutations surface both HTTP and CLI envelope failures', async () => {
  await assert.rejects(setPaperRead('paper', true, async () => Response.json({ error: 'CLI unavailable' }, { status: 502 })), /CLI unavailable/)
  await assert.rejects(setPaperRead('paper', false, async () => Response.json({ ok: false, error: { message: 'paper missing' } })), /paper missing/)
})
