import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

import { deleteExpiredInviteCodes } from '../api'
import { useInviteCodes } from './invite-codes-provider'

export function InviteCodesPrimaryButtons() {
  const { t } = useTranslation()
  const { openDialog, refresh } = useInviteCodes()
  const [cleaning, setCleaning] = useState(false)

  const handleCleanup = async () => {
    setCleaning(true)
    try {
      const res = await deleteExpiredInviteCodes()
      if (res.success) {
        toast.success(t('Cleaned up expired invite codes'))
        refresh()
      } else {
        toast.error(res.message || t('Failed to clean up'))
      }
    } finally {
      setCleaning(false)
    }
  }

  return (
    <div className='flex gap-2'>
      <Button variant='outline' size='sm' onClick={handleCleanup} disabled={cleaning}>
        {t('Admin Clean Up Expired', { defaultValue: '清理过期邀请码' })}
      </Button>
      <Button size='sm' onClick={() => openDialog('create')}>
        {t('Admin Generate Codes', { defaultValue: '生成邀请码' })}
      </Button>
    </div>
  )
}