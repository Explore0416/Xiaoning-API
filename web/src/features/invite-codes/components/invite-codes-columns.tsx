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
import type { ColumnDef } from '@tanstack/react-table'

import { DataTableColumnHeader } from '@/components/data-table'
import { StatusBadge } from '@/components/status-badge'
import { formatCurrencyFromUSD, getCurrencyDisplay } from '@/lib/currency'
import { formatTimestamp } from '@/lib/format'

import type { InviteCode } from '../types'

export const columns: ColumnDef<InviteCode>[] = [
  {
    accessorKey: 'id',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='ID' />
    ),
    meta: { className: 'w-16' },
  },
  {
    accessorKey: 'code',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Code' />
    ),
    meta: { className: 'font-mono text-xs' },
    cell: ({ row }) => (
      <span className='font-mono text-xs'>{row.original.code}</span>
    ),
  },
  {
    accessorKey: 'status',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Status' />
    ),
    cell: ({ row }) => {
      const status = row.original.status
      const preset =
        status === 1
          ? { variant: 'success' as const, label: 'Enabled' }
          : status === 2
            ? { variant: 'neutral' as const, label: 'Disabled' }
            : { variant: 'danger' as const, label: 'Exhausted' }
      return (
        <StatusBadge
          label={preset.label}
          variant={preset.variant}
          copyable={false}
        />
      )
    },
  },
  {
    accessorKey: 'quota',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Bonus Quota' />
    ),
    cell: ({ row }) => {
      const q = row.original.quota
      if (q === 0) return <span className='text-muted-foreground'>—</span>
      const { meta } = getCurrencyDisplay()
      if (meta.kind === 'tokens') return q.toLocaleString()
      return formatCurrencyFromUSD(q, { digitsLarge: 2, digitsSmall: 4, abbreviate: false })
    },
  },
  {
    accessorKey: 'used_count',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Used' />
    ),
    cell: ({ row }) => {
      const { used_count, max_use_count } = row.original
      if (max_use_count === 0) return <span>{used_count}</span>
      return <span>{used_count}/{max_use_count}</span>
    },
  },
  {
    accessorKey: 'expired_time',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Expires' />
    ),
    cell: ({ row }) => {
      const t = row.original.expired_time
      if (t === 0) return <span className='text-muted-foreground'>Never</span>
      return <span>{formatTimestamp(t)}</span>
    },
  },
  {
    accessorKey: 'created_time',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Created' />
    ),
    cell: ({ row }) => formatTimestamp(row.original.created_time),
  },
]
