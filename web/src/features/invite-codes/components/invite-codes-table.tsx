import type { PaginationState } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'

import { DataTablePage, useDataTable } from '@/components/data-table'
import { Input } from '@/components/ui/input'

import { columns } from './invite-codes-columns'
import { useInviteCodes } from './invite-codes-provider'

export function InviteCodesTable() {
  const { t } = useTranslation()
  const {
    codes,
    total,
    isLoading,
    page,
    pageSize,
    keyword,
    setPage,
    setPageSize,
    setKeyword,
  } = useInviteCodes()

  // Provider keeps 1-based `page`; TanStack pagination is 0-based `pageIndex`.
  const pagination: PaginationState = { pageIndex: page - 1, pageSize }
  const onPaginationChange = (updater: unknown) => {
    const next =
      typeof updater === 'function'
        ? (updater as (p: PaginationState) => PaginationState)(pagination)
        : (updater as PaginationState)
    setPage(next.pageIndex + 1)
    setPageSize(next.pageSize)
  }

  const { table } = useDataTable({
    data: codes,
    columns,
    totalCount: total,
    pagination,
    onPaginationChange,
    manualPagination: true,
    manualFiltering: true,
  })

  return (
    <DataTablePage
      table={table}
      columns={columns}
      isLoading={isLoading}
      emptyTitle={t('No Invite Codes Found', { defaultValue: '暂无邀请码' })}
      emptyDescription={t(
        'No invite codes available. Create your first invite code to get started.',
        { defaultValue: '暂无邀请码，请先生成邀请码。' }
      )}
      skeletonKeyPrefix='invite-codes-skeleton'
      applyHeaderSize
      toolbarProps={{
        searchPlaceholder: t('Search invite codes...', {
          defaultValue: '搜索邀请码...',
        }),
        additionalSearch: (
          <Input
            placeholder={t('Search invite codes...', {
              defaultValue: '搜索邀请码...',
            })}
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value)
              setPage(1)
            }}
            className='max-w-xs'
          />
        ),
      }}
    />
  )
}
