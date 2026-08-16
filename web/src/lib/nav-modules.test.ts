import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  isAuthenticatedModuleVisible,
  parseHeaderNavModules,
} from './nav-modules'

describe('header navigation modules', () => {
  test('keeps monitoring disabled by default', () => {
    const modules = parseHeaderNavModules(null)

    assert.deepEqual(modules.monitoring, {
      enabled: false,
      requireAuth: true,
    })
  })

  test('forces monitoring to remain authenticated for legacy public config', () => {
    const modules = parseHeaderNavModules(
      JSON.stringify({ monitoring: { enabled: true, requireAuth: false } })
    )

    assert.deepEqual(modules.monitoring, {
      enabled: true,
      requireAuth: true,
    })
    assert.equal(isAuthenticatedModuleVisible(modules.monitoring, false), false)
    assert.equal(isAuthenticatedModuleVisible(modules.monitoring, true), true)
  })
})
