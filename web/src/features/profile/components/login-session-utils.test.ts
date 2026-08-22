import { describe, expect, test } from 'vitest'

import type { TFunction } from 'i18next'

import { loginMethodLabel, sessionDevice } from './login-session-utils'

const translate = ((key: string) => key) as TFunction

describe('login session presentation', () => {
  test('labels built-in and provider OAuth login methods', () => {
    expect(loginMethodLabel('password', translate)).toBe('Password')
    expect(loginMethodLabel('2fa', translate)).toBe('Two-factor Authentication')
    expect(loginMethodLabel('oauth:github', translate)).toBe('OAuth · GitHub')
    expect(loginMethodLabel('oauth:custom-provider', translate)).toBe(
      'OAuth · custom-provider'
    )
  })

  test('derives a stable browser and operating-system label', () => {
    expect(
      sessionDevice(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit Safari/605.1.15',
        'Unknown device',
        'Browser'
      )
    ).toBe('Safari · macOS')
    expect(sessionDevice('', 'Unknown device', 'Browser')).toBe(
      'Unknown device'
    )
  })
})
