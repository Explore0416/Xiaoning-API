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
import { Ticket, RotateCcw, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { handleServerError } from '@/lib/handle-server-error'

import { getSelfResetCards, useResetCard } from '../api'
import type { ResetCard, ResetCardListData } from '../types'

interface Props {
  onUsed?: () => void | Promise<void>
}

function isExpired(card: ResetCard) {
  return card.expires_at > 0 && card.expires_at < Date.now() / 1000
}

function ResetCardStatusBadge(props: {
  card: ResetCard
  t: (k: string) => string
}) {
  const { card, t } = props
  if (card.status === 'used') {
    return <StatusBadge label={t('Used')} variant='neutral' copyable={false} />
  }
  if (card.status === 'revoked') {
    return (
      <StatusBadge label={t('Revoked')} variant='neutral' copyable={false} />
    )
  }
  if (isExpired(card)) {
    return (
      <StatusBadge label={t('Expired')} variant='warning' copyable={false} />
    )
  }
  return (
    <StatusBadge label={t('Available')} variant='success' copyable={false} />
  )
}

export function ResetCardsPanel({ onUsed }: Props) {
  const { t } = useTranslation()
  const [data, setData] = useState<ResetCardListData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [confirmCard, setConfirmCard] = useState<ResetCard | null>(null)
  const [using, setUsing] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const res = await getSelfResetCards()
      if (res.success) {
        setData(res.data || { cards: [], available: 0 })
      } else {
        handleServerError(res)
      }
    } catch (error) {
      handleServerError(error)
    }
  }, [])

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      await loadData()
      setLoading(false)
    }
    init()
  }, [loadData])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await loadData()
    } finally {
      setRefreshing(false)
    }
  }

  const handleUse = async () => {
    if (!confirmCard) return
    setUsing(true)
    try {
      const res = await useResetCard(confirmCard.id)
      if (res.success) {
        toast.success(
          t('Reset {{count}} active subscriptions', {
            count: res.data?.reset_count || 0,
          })
        )
        await loadData()
        await onUsed?.()
      } else {
        handleServerError(res)
      }
    } catch (error) {
      handleServerError(error, t('Operation failed'))
    } finally {
      setUsing(false)
      setConfirmCard(null)
    }
  }

  if (loading) {
    return <Skeleton className='h-16 w-full' />
  }

  const cards = data?.cards ?? []
  const availableCount = data?.available ?? 0

  return (
    <>
      <div className='rounded-xl border p-3 sm:p-4'>
        <div className='flex flex-wrap items-center justify-between gap-2.5 sm:gap-3'>
          <div className='flex min-w-0 flex-wrap items-center gap-2'>
            <span className='flex items-center gap-1.5 text-sm font-medium'>
              <Ticket className='h-4 w-4' />
              {t('Reset Cards')}
            </span>
            <StatusBadge
              label={`${availableCount} ${t('Available')}`}
              variant={availableCount > 0 ? 'success' : 'neutral'}
              copyable={false}
            />
          </div>
          <Button
            variant='ghost'
            size='icon'
            className='h-8 w-8'
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
            />
          </Button>
        </div>

        <p className='text-muted-foreground mt-1.5 text-xs'>
          {t(
            'Use a reset card to reset the quota of all your active subscriptions.'
          )}
        </p>

        {cards.length === 0 ? (
          <p className='text-muted-foreground mt-3 text-xs'>
            {t('No available reset cards')}
          </p>
        ) : (
          <div className='mt-3 max-h-56 space-y-2 overflow-y-auto pr-1'>
            {cards.map((card) => {
              const usable = card.status === 'available' && !isExpired(card)

              return (
                <div
                  key={card.id}
                  className='bg-background flex items-center justify-between gap-3 rounded-md border p-2.5 text-xs'
                >
                  <div className='min-w-0'>
                    <div className='flex items-center gap-2'>
                      <span className='font-medium'>
                        {t('Reset Card')} #{card.id}
                      </span>
                      <ResetCardStatusBadge card={card} t={t} />
                    </div>
                    <div className='text-muted-foreground mt-1'>
                      {card.note ? `${t('Note')}: ${card.note}` : null}
                      {card.note ? ' · ' : null}
                      {card.expires_at > 0
                        ? `${t('Expires at')}: ${new Date(
                            card.expires_at * 1000
                          ).toLocaleString()}`
                        : t('Never expires')}
                    </div>
                  </div>
                  <Button
                    size='sm'
                    variant='outline'
                    className='shrink-0'
                    disabled={!usable}
                    onClick={() => setConfirmCard(card)}
                  >
                    <RotateCcw className='mr-1 h-3.5 w-3.5' />
                    {t('Use')}
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {confirmCard && (
        <ConfirmDialog
          open
          onOpenChange={(v) => !v && setConfirmCard(null)}
          title={t('Use reset card')}
          desc={t(
            'Using reset card #{{id}} will reset the quota of all your active subscriptions. Continue?',
            { id: confirmCard.id }
          )}
          confirmText={t('Use')}
          handleConfirm={handleUse}
          isLoading={using}
        />
      )}
    </>
  )
}
