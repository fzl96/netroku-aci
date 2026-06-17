import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DASHBOARD_TABLE_HEAD_CLS,
  DENSE_TABLE_HEAD_CLS,
  MUTED_TABLE_HEAD_CLS,
  TABLE_SCROLL_CLS,
} from './ui-classes'

test('table wrappers use a bounded scroll area', () => {
  assert.ok(TABLE_SCROLL_CLS.includes('max-h-[calc(100vh-14rem)]'))
  assert.ok(TABLE_SCROLL_CLS.includes('overflow-auto'))
})

test('table header styles stay above scrolled rows', () => {
  for (const className of [
    DENSE_TABLE_HEAD_CLS,
    MUTED_TABLE_HEAD_CLS,
    DASHBOARD_TABLE_HEAD_CLS,
  ]) {
    assert.ok(className.includes('sticky'))
    assert.ok(className.includes('top-0'))
    assert.ok(className.includes('z-10'))
  }
})
