import { useTranslation } from 'react-i18next'

import { DataTableBulkActions } from '@/components/data-table-bulk-actions'

import { useInviteCodes } from './invite-codes-provider'

export function InviteCodesBulkActions() {
  const { t } = useTranslation()
  const { openDialog } = useInviteCodes()

  return (
    <DataTableBulkActions>
      <DataTableBulkActions.Button onClick={() => openDialog('create')}>
        {t('Generate Codes')}
      </DataTableBulkActions.Button>
    </DataTableBulkActions>
  )
}
