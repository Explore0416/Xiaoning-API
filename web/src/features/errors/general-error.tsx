/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useNavigate, useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { isAuthSessionError } from '@/lib/auth-session'
import { cn } from '@/lib/utils'

const FEEDBACK_URL = 'https://github.com/QuantumNous/new-api/issues'

type GeneralErrorProps = React.HTMLAttributes<HTMLDivElement> & {
  minimal?: boolean
  error?: unknown
}

function getHttpStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const response = (error as Record<string, unknown>).response
  if (typeof response !== 'object' || response === null) return undefined
  const status = (response as Record<string, unknown>).status
  return typeof status === 'number' ? status : undefined
}

function isSessionStyleError(error: unknown): boolean {
  if (isAuthSessionError(error)) {
    return error.kind === 'session_expired' || error.kind === 'out_of_sync'
  }
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes('session expired') ||
    message.includes('会话已过期') ||
    message.includes('auth session')
  )
}

function isTransientStyleError(error: unknown): boolean {
  if (isAuthSessionError(error)) return error.kind === 'transient'
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes('network') ||
    message.includes('failed to fetch') ||
    message.includes('timeout') ||
    message.includes('网络')
  )
}

export function GeneralError({
  className,
  minimal = false,
  error,
}: GeneralErrorProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { history } = useRouter()
  const status = getHttpStatus(error)
  const sessionError = isSessionStyleError(error)
  const transientError = !sessionError && isTransientStyleError(error)
  const isRateLimited = status === 429

  useEffect(() => {
    if (!sessionError || typeof window === 'undefined') return
    const path = window.location.pathname
    if (path === '/sign-in' || path === '/login' || path === '/otp') return
    const redirect = `${window.location.pathname}${window.location.search}`
    const target =
      redirect && redirect !== '/'
        ? `/sign-in?redirect=${encodeURIComponent(redirect)}`
        : '/sign-in'
    window.location.replace(target)
  }, [sessionError])

  const title = sessionError
    ? t('Session expired!')
    : isRateLimited
      ? t('Too many requests')
      : transientError
        ? t('Network connection failed or server not responding')
        : `${t('Oops! Something went wrong')} ${`:')`}`
  const description = sessionError
    ? t('Re-login')
    : isRateLimited
      ? t('Please wait a moment before trying again.')
      : t('Please try again later.')
  const statusLabel = sessionError
    ? 401
    : transientError
      ? status && status >= 500
        ? status
        : '!'
      : (status ?? 500)

  return (
    <div className={cn('h-svh w-full', className)}>
      <div className='m-auto flex h-full w-full flex-col items-center justify-center gap-2'>
        {!minimal && (
          <h1 className='text-[7rem] leading-tight font-bold'>{statusLabel}</h1>
        )}
        <span className='font-medium'>{title}</span>
        <p className='text-muted-foreground text-center'>
          {sessionError ? (
            description
          ) : (
            <>
              {t('We apologize for the inconvenience.')} <br /> {description}
            </>
          )}
        </p>
        {!minimal && !sessionError && (
          <p className='text-muted-foreground text-center text-sm'>
            {t('If this keeps happening, please report it on GitHub Issues.')}
          </p>
        )}
        {!minimal && (
          <div className='mt-6 flex flex-wrap justify-center gap-4'>
            {sessionError ? (
              <Button onClick={() => navigate({ to: '/sign-in' })}>
                {t('Re-login')}
              </Button>
            ) : (
              <>
                <Button variant='outline' onClick={() => history.go(-1)}>
                  {t('Go Back')}
                </Button>
                <Button
                  variant='outline'
                  render={
                    <a
                      href={FEEDBACK_URL}
                      target='_blank'
                      rel='noopener noreferrer'
                    />
                  }
                >
                  {t('Report an issue')}
                </Button>
                <Button onClick={() => navigate({ to: '/' })}>
                  {t('Back to Home')}
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
