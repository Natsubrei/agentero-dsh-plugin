import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pdfChatActions } from '../src/client/chat-actions.ts'

function fixture() {
  const sent = []
  const initialized = []
  let focused = false
  const conversation = { async send(text) { sent.push(text) } }
  const actx = {
    get conversation() { throw new Error('cannot get property "conversation" without inject') },
    get: name => name === 'conversation' ? conversation : undefined,
  }
  const binding = { ctx: actx }
  const ctx = {
    sessions: {
      binding: id => id === 'paper-session' ? binding : undefined,
      scope: id => id === 'paper-session' ? actx : undefined,
    },
    conversation: {
      input: {
        requestDraftInitialization(target, options) {
          initialized.push({ target, options })
          return 'applied'
        },
        for(target) {
          assert.equal(target, actx)
          return { focus() { focused = true } }
        },
      },
    },
  }
  return { ctx, actx, conversation, binding, sent, initialized, focused: () => focused }
}

test('citations append to the PDF session draft and focus it without sending', async () => {
  const f = fixture()
  await pdfChatActions(f.ctx, 'paper-session').cite('paper p.2\nquote')
  assert.deepEqual(f.initialized, [{
    target: f.binding,
    options: { prompt: 'paper p.2\nquote', whenDraftExists: 'append' },
  }])
  assert.equal(f.focused(), true)
  assert.deepEqual(f.sent, [])
})

test('quick questions send to the PDF session without replacing the composer draft', async () => {
  const f = fixture()
  await pdfChatActions(f.ctx, 'paper-session').ask('quote\nquestion')
  assert.deepEqual(f.sent, ['quote\nquestion'])
  assert.deepEqual(f.initialized, [])
})

test('missing sessions and blocked drafts reject instead of reporting success', async () => {
  const f = fixture()
  await assert.rejects(pdfChatActions(f.ctx, 'closed-session').cite('quote'))
  await assert.rejects(pdfChatActions(f.ctx, 'closed-session').ask('question'))
  f.ctx.conversation.input.requestDraftInitialization = () => 'blocked'
  await assert.rejects(pdfChatActions(f.ctx, 'paper-session').cite('quote'))
  assert.equal(f.focused(), false)
  assert.deepEqual(f.sent, [])
})

test('send failures reach the panel so its question can be retried', async () => {
  const f = fixture()
  f.conversation.send = async () => { throw new Error('offline') }
  await assert.rejects(pdfChatActions(f.ctx, 'paper-session').ask('question'), /offline/)
})
