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
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Input } from '@/components/ui/input'
import { handleServerError } from '@/lib/handle-server-error'

import { adminCreateResetCardsForAllUsers } from '../../api'
import { useSubscriptions } from '../subscriptions-provider'

export function GrantAllResetCardsDialog() {
  const { t } = useTranslation()
  const { open, setOpen } = useSubscriptions()
  const [grantCount, setGrantCount] = useState('1')
  const [grantNote, setGrantNote] = useState('')
  const [grantExpiresDays, setGrantExpiresDays] = useState('0')
  const [granting, setGranting] = useState(false)
  const isOpen = open === 'grant-all-reset-cards'

  useEffect(() => {
    if (isOpen) {
      setGrantCount('1')
      setGrantNote('')
      setGrantExpiresDays('0')
    }
  }, [isOpen])

  const handleConfirm = async () => {
    const count = Number(grantCount)
    if (!Number.isInteger(count) || count <= 0 || count > 1000) {
      toast.error(t('Quantity must be between 1 and 1000'))
      return
    }
    const days = Number(grantExpiresDays)
    if (!Number.isFinite(days) || days < 0) {
      toast.error(t('Expiry days cannot be negative'))
      return
    }
    setGranting(true)
    try {
      const res = await adminCreateResetCardsForAllUsers({
        count,
        note: grantNote.trim(),
        expires_at:
          days > 0 ? Math.floor(Date.now() / 1000) + days * 86400 : 0,
      })
      if (res.success) {
        toast.success(
          t('Issued {{count}} reset cards to {{users}} users', {
            count: res.data?.card_count || 0,
            users: res.data?.user_count || 0,
          })
        )
        setOpen(null)
      } else {
        handleServerError(res)
      }
    } catch (error) {
      handleServerError(error, t('Operation failed'))
    } finally {
      setGranting(false)
    }
  }

  return (
    <ConfirmDialog
      open={isOpen}
      onOpenChange={(v) => !v && setOpen(null)}
      title={t('Issue reset cards to all users')}
      desc={t(
        'Every enabled user will receive the specified number of reset cards. Each card lets the user reset the quota of all their active subscriptions once.'
      )}
      confirmText={t('Issue reset cards')}
      handleConfirm={handleConfirm}
      isLoading={granting}
    >
      <div className='space-y-3'>
        <label className='block space-y-1.5 text-sm'>
          <span>{t('Quantity')}</span>
          <Input
            type='number'
            min={1}
            max={1000}
            value={grantCount}
            onChange={(e) => setGrantCount(e.target.value)}
          />
        </label>
        <label className='block space-y-1.5 text-sm'>
          <span>{t('Expiry days (0 = never)')}</span>
          <Input
            type='number'
            min={0}
            value={grantExpiresDays}
            onChange={(e) => setGrantExpiresDays(e.target.value)}
          />
        </label>
        <label className='block space-y-1.5 text-sm'>
          <span>{t('Note')}</span>
          <Input
            value={grantNote}
            maxLength={255}
            onChange={(e) => setGrantNote(e.target.value)}
            placeholder={t('Optional')}
          />
        </label>
      </div>
    </ConfirmDialog>
  )
}