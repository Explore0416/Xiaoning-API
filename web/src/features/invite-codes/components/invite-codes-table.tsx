import { useTranslation } from 'react-i18next'

import { StaticDataTable, DataTableToolbar } from '@/components/data-table'
import { DataTableBulkActions } from '@/components/data-table'
import { Input } from '@/components/ui/input'

import { columns } from './invite-codes-columns'
import { useInviteCodes } from './invite-codes-provider'

export function InviteCodesTable() {
  const { t } = useTranslation()
  const { codes, total, isLoading, page, pageSize, keyword, setPage, setPageSize, setKeyword } = useInviteCodes()

  return (
    <StaticDataTable
      columns={columns}
      data={codes}
      total={total}
      page={page}
      pageSize={pageSize}
      onPageChange={setPage}
      onPageSizeChange={setPageSize}
      isLoading={isLoading}
      bulkActions={
        <DataTableBulkActions>
          <DataTableBulkActions.Button onClick={() => {}}>
            {t('Generate Codes')}
          </DataTableBulkActions.Button>
        </DataTableBulkActions>
      }
      toolbar={
        <DataTableToolbar>
          <Input
            placeholder={t('Search invite codes...')}
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value)
              setPage(1)
            }}
          />
        </DataTableToolbar>
      }
    />
  )
}
