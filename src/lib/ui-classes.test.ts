import assert from 'node:assert/strict'
import test from 'node:test'

import {
  APP_MAIN_CLS,
  DASHBOARD_TABLE_HEAD_CLS,
  DENSE_TABLE_HEAD_CLS,
  MUTED_TABLE_HEAD_CLS,
  TABLE_SCROLL_CLS,
} from './ui-classes'

test('table wrappers bound their scroll area from md up only', () => {
  assert.ok(TABLE_SCROLL_CLS.includes('md:max-h-[calc(100vh-14rem)]'))
  assert.ok(TABLE_SCROLL_CLS.includes('md:overflow-auto'))
  // Uncapped on phones: a capped box nests a scroll region inside the page
  // scroll, trapping the viewport and stranding the page header on screen.
  assert.ok(!/(^|\s)max-h-/.test(TABLE_SCROLL_CLS))
  // Wide tables still pan sideways on a phone...
  assert.ok(TABLE_SCROLL_CLS.includes('overflow-x-auto'))
  // ...but never open a vertical sub-scroller: a horizontal scrollbar eats box
  // height and leaves a few px of travel for a swipe to latch onto.
  assert.ok(TABLE_SCROLL_CLS.includes('overflow-y-hidden'))
})

test('table header styles stay above scrolled rows from md up', () => {
  for (const className of [DENSE_TABLE_HEAD_CLS, MUTED_TABLE_HEAD_CLS, DASHBOARD_TABLE_HEAD_CLS]) {
    // md-only: without a capped box on phones there is no scrollport to pin
    // against, so an unconditional sticky head would pin to the page instead.
    assert.ok(className.includes('md:sticky'))
    assert.ok(className.includes('md:top-0'))
    assert.ok(className.includes('z-10'))
    assert.ok(!/(^|\s)(sticky|top-0)(\s|$)/.test(className))
  }
})

test('the app shell main does not open a scroll container', () => {
  // `main` stretches to its content height (its flex parent is only
  // `min-h-svh`), so an overflow scrollport here never scrolls the page — it
  // only shadows it. On phones the `min-h-full` page wrapper sits below the
  // `h-14` MobileTopBar, so the scrollport ends up exactly 56px short: a touch
  // swipe latches onto it, travels 56px and dead-ends at the table toolbar.
  // Setting overflow-y also forces overflow-x to `auto`, trapping sideways
  // panning the same way. The window is the page scrollport.
  assert.ok(!/overflow/.test(APP_MAIN_CLS))
})

test('the app shell main still fills the space beside the sidebar', () => {
  assert.ok(APP_MAIN_CLS.includes('flex-1'))
  // Without `min-w-0` the flex item's automatic minimum size is its min-content
  // width, so a wide table row holds `main` open past the sidebar and scrolls
  // the page sideways. The dropped overflow used to zero this out for free.
  assert.ok(APP_MAIN_CLS.includes('min-w-0'))
})
