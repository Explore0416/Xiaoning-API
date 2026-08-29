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
import { type ColumnDef } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { TableId } from '@/components/table-id'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatQuota, formatTimestampToDate } from '@/lib/format'

import { REDEMPTION_FILTER_EXPIRED, REDEMPTION_STATUSES } from '../constants'
import { isInviteCodeExpired, isTimestampExpired } from '../lib'
import { type InviteCode } from '../types'
import { DataTableRowActions } from './data-table-row-actions'

export function useInviteCodesColumns(): ColumnDef<InviteCode>[] {
  const { t } = useTranslation()
  return [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label={t('Select all')}
          className='translate-y-[2px]'
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label={t('Select row')}
          className='translate-y-[2px]'
        />
      ),
      enableSorting: false,
      enableHiding: false,
      size: 40,
    },
    {
      accessorKey: 'id',
      header: t('ID'),
      meta: { mobileHidden: true },
      cell: ({ row }) => {
        return (
          <TableId value={row.getValue('id') as number} className='w-[60px]' />
        )
      },
      size: 80,
    },
    {
      accessorKey: 'code',
      header: t('Code'),
      meta: { mobileTitle: true },
      cell: ({ row }) => (
        <span className='font-mono font-medium'>{row.getValue('code')}</span>
      ),
      size: 200,
    },
    {
      accessorKey: 'status',
      header: t('Status'),
      meta: { mobileBadge: true },
      cell: ({ row }) => {
        const inviteCode = row.original
        const statusValue = row.getValue('status') as number

        // Check if expired
        if (isInviteCodeExpired(inviteCode.expired_time, statusValue)) {
          return (
            <StatusBadge
              label={t('Expired')}
              variant='warning'
              copyable={false}
              className='-ml-1.5'
            />
          )
        }

        const statusConfig = REDEMPTION_STATUSES[statusValue]

        if (!statusConfig) {
          return null
        }

        return (
          <StatusBadge
            label={t(statusConfig.labelKey)}
            variant={statusConfig.variant}
            copyable={false}
            className='-ml-1.5'
          />
        )
      },
      filterFn: (row, id, value) => {
        const inviteCode = row.original
        const statusValue = row.getValue(id) as number

        // Check if expired status is being filtered
        if (value.includes(REDEMPTION_FILTER_EXPIRED)) {
          if (isInviteCodeExpired(inviteCode.expired_time, statusValue)) {
            return true
          }
        }

        // Check regular status
        return value.includes(String(statusValue))
      },
      size: 120,
    },
    {
      accessorKey: 'used_count',
      header: t('Used'),
      cell: ({ row }) => {
        const { used_count, max_use_count } = row.original
        if (max_use_count === 0) return <span>{used_count}</span>
        return <span>{used_count}/{max_use_count}</span>
      },
      enableSorting: false,
      size: 120,
    },
    {
      accessorKey: 'quota',
      header: t('Quota'),
      cell: ({ row }) => {
        const quota = row.getValue('quota') as number
        return (
          <StatusBadge
            label={formatQuota(quota)}
            variant='neutral'
            copyable={false}
            className='-ml-1.5'
          />
        )
      },
      size: 120,
    },
    {
      accessorKey: 'created_time',
      header: t('Created'),
      meta: { mobileHidden: true },
      cell: ({ row }) => {
        return (
          <div className='min-w-[160px] font-mono text-sm'>
            {formatTimestampToDate(row.getValue('created_time'))}
          </div>
        )
      },
      size: 180,
    },
    {
      accessorKey: 'expired_time',
      header: t('Expires'),
      meta: { mobileHidden: true },
      cell: ({ row }) => {
        const expiredTime = row.getValue('expired_time') as number
        if (expiredTime === 0) {
          return (
            <StatusBadge
              label={t('Never')}
              variant='neutral'
              copyable={false}
              className='-ml-1.5'
            />
          )
        }
        const isExpired = isTimestampExpired(expiredTime)
        return (
          <div
            className={`min-w-[160px] font-mono text-sm ${isExpired ? 'text-destructive' : ''}`}
          >
            {formatTimestampToDate(expiredTime)}
          </div>
        )
      },
      size: 180,
    },
    {
      accessorKey: 'created_by_user_id',
      header: t('Redeemed By'),
      meta: { mobileHidden: true },
      cell: ({ row }) => {
        const userId = row.getValue('created_by_user_id') as number

        if (userId === 0) {
          return <span className='text-muted-foreground text-sm'>-</span>
        }

        return (
          <Tooltip>
            <TooltipTrigger
              render={
                <StatusBadge
                  label={t('User {{id}}', { id: userId })}
                  variant='neutral'
                  copyable={false}
                  className='cursor-help'
                />
              }
            ></TooltipTrigger>
            <TooltipContent>
              <div className='space-y-1 text-xs'>
                <div>
                  {t('User ID:')} {userId}
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        )
      },
      size: 140,
    },
    {
      id: 'actions',
      header: () => t('Actions'),
      cell: ({ row }) => <DataTableRowActions row={row} />,
      meta: { pinned: 'right' as const },
    },
  ]
}
