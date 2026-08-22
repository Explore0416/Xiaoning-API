import { MoreHorizontal, Trash } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import type { InviteCode } from '../types'
import { useInviteCodes } from './invite-codes-provider'

export function InviteCodeRowActions({ code }: { code: InviteCode }) {
  const { t } = useTranslation()
  const { openDialog } = useInviteCodes()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' size='icon' className='h-8 w-8'>
          <MoreHorizontal className='h-4 w-4' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        <DropdownMenuItem onClick={() => openDialog('delete', code)}>
          <Trash className='h-4 w-4 mr-2 text-destructive' />
          {t('Delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
