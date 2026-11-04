import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFString } from 'pdf-lib'
import { writePdfBookmarks } from '../lib/bookmarks-write.js'

test('writes bookmarks after loading pdf-lib through Node', async () => {
  const source = await PDFDocument.create()
  source.addPage()

  const saved = await writePdfBookmarks(await source.save(), [{
    origin: null,
    title: 'Introduction',
    pageIndex: 0,
    children: [],
  }])

  const result = await PDFDocument.load(saved)
  const name = PDFName.of
  const outlines = result.catalog.lookup(name('Outlines'), PDFDict)
  const first = outlines.lookup(name('First'), PDFDict)
  const title = first.lookup(name('Title'))

  assert.ok(title instanceof PDFString || title instanceof PDFHexString)
  assert.equal(title.decodeText(), 'Introduction')
})
