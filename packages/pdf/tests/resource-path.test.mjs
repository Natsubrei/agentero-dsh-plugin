import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseFileResource, resourceName, vaultRelative } from '../src/client/resource-path.ts'

test('parses session-scoped file addresses with encoded segments', () => {
  assert.deepEqual(
    parseFileResource('dsh-resource://file/session/s2/papers/1706.03762/paper%20one.pdf'),
    { scope: 'session', sessionId: 's2', path: 'papers/1706.03762/paper one.pdf' },
  )
  assert.deepEqual(
    parseFileResource('dsh-resource://file/session/s2//tmp/report.pdf'),
    { scope: 'session', sessionId: 's2', path: '/tmp/report.pdf' },
  )
})

test('parses absolute file addresses', () => {
  assert.deepEqual(
    parseFileResource('dsh-resource://file/absolute/Users/me/Vault/papers/p/p.pdf'),
    { scope: 'absolute', path: '/Users/me/Vault/papers/p/p.pdf' },
  )
  assert.deepEqual(
    parseFileResource('dsh-resource://file/absolute/C:/Vault/p.pdf'),
    { scope: 'absolute', path: 'C:/Vault/p.pdf' },
  )
})

test('rejects other resources and malformed escapes', () => {
  assert.equal(parseFileResource('sidebar://agentero.pdf'), undefined)
  assert.equal(parseFileResource('dsh-resource://file/session/s2/%E0%A4%A'), undefined)
})

test('maps only paths inside the vault', () => {
  assert.equal(vaultRelative('/Users/me/Vault', '/Users/me/Vault/papers/p/p.pdf'), 'papers/p/p.pdf')
  assert.equal(vaultRelative('/Users/me/Vault/', '/Users/me/Vault/papers/p/p.pdf'), 'papers/p/p.pdf')
  assert.equal(vaultRelative('/Users/me/Vault', '/Users/me/Other/p.pdf'), undefined)
  assert.equal(vaultRelative('/Users/me/Vault', '/Users/me/Vault'), undefined)
})

test('matches Windows vault paths case-insensitively', () => {
  assert.equal(vaultRelative('C:\\Vault', 'c:/vault/papers/p/p.pdf'), 'papers/p/p.pdf')
})

test('names the PDF behind an address', () => {
  assert.equal(resourceName('dsh-resource://file/session/s2/papers/p/paper%20one.pdf'), 'paper one.pdf')
  assert.equal(resourceName('sidebar://agentero.pdf'), undefined)
})
