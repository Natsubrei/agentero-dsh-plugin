import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pdfChatActions } from '../src/client/chat-actions.ts'

function fixture() {
  const sent = []
  const conversation = { async send(text) { sent.push(text) } }
  const actx = {
    get conversation() { throw new Error('cannot get property "conversation" without inject') },
    get: name => name === 'conversation' ? conversation : undefined,
  }
  const ctx = {
    sessions: { scope: id => id === 'paper-session' ? actx : undefined },
  }
  return { ctx, conversation, sent }
}

test('quick questions send to the PDF session', async () => {
  const f = fixture()
  await pdfChatActions(f.ctx, 'paper-session').ask('quote\nquestion')
  assert.deepEqual(f.sent, ['quote\nquestion'])
})

test('missing sessions reject instead of reporting success', async () => {
  const f = fixture()
  await assert.rejects(pdfChatActions(f.ctx, 'closed-session').ask('question'))
  assert.deepEqual(f.sent, [])
})

test('send failures reach the panel so its question can be retried', async () => {
  const f = fixture()
  f.conversation.send = async () => { throw new Error('offline') }
  await assert.rejects(pdfChatActions(f.ctx, 'paper-session').ask('question'), /offline/)
})
