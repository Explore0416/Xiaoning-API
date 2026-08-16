import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { parseHeaderNavModules } from './nav-modules'

describe('header navigation modules', () => {
  test('keeps monitoring disabled by default', () => {
    const modules = parseHeaderNavModules(null)

    assert.deepEqual(modules.monitoring, {
      enabled: false,
      requireAuth: true,
    })
  })

  test('parses the administrator monitoring module independently', () => {
    const modules = parseHeaderNavModules(
      JSON.stringify({ monitoring: { enabled: true, requireAuth: true } })
    )

    assert.deepEqual(modules.monitoring, {
      enabled: true,
      requireAuth: true,
    })
    assert.equal(modules.pricing.enabled, true)
  })
})
