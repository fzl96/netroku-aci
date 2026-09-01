import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DASHBOARD_TABLE_HEAD_CLS,
  DENSE_TABLE_HEAD_CLS,
  MUTED_TABLE_HEAD_CLS,
  TABLE_SCROLL_CLS,
} from './ui-classes'

test('table wrappers bound their scroll area from md up only', () => {
  assert.ok(TABLE_SCROLL_CLS.includes('md:max-h-[calc(100vh-14rem)]'))
  assert.ok(TABLE_SCROLL_CLS.includes('overflow-auto'))
  // Uncapped on phones: a capped box nests a scroll region inside the page
  // scroll, trapping the viewport and stranding the page header on screen.
  assert.ok(!/(^|\s)max-h-/.test(TABLE_SCROLL_CLS))
})

test('table header styles stay above scrolled rows from md up', () => {
  for (const className of [
    DENSE_TABLE_HEAD_CLS,
    MUTED_TABLE_HEAD_CLS,
    DASHBOARD_TABLE_HEAD_CLS,
  ]) {
    // md-only: without a capped box on phones there is no scrollport to pin
    // against, so an unconditional sticky head would pin to the page instead.
    assert.ok(className.includes('md:sticky'))
    assert.ok(className.includes('md:top-0'))
    assert.ok(className.includes('z-10'))
    assert.ok(!/(^|\s)(sticky|top-0)(\s|$)/.test(className))
  }
})
