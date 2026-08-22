import { describe, expect, test } from 'vitest'

import {
  isAuthenticatedModuleVisible,
  parseHeaderNavModules,
} from './nav-modules'

describe('header navigation modules', () => {
  test('keeps monitoring disabled by default', () => {
    const modules = parseHeaderNavModules(null)

    expect(modules.monitoring).toEqual({
      enabled: false,
      requireAuth: true,
    })
  })

  test('forces monitoring to remain authenticated for legacy public config', () => {
    const modules = parseHeaderNavModules(
      JSON.stringify({ monitoring: { enabled: true, requireAuth: false } })
    )

    expect(modules.monitoring).toEqual({
      enabled: true,
      requireAuth: true,
    })
    expect(isAuthenticatedModuleVisible(modules.monitoring, false)).toBe(false)
    expect(isAuthenticatedModuleVisible(modules.monitoring, true)).toBe(true)
  })
})
