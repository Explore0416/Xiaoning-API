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
import React, { useState } from 'react'

import useDialogState from '@/hooks/use-dialog'

import { type InviteCode, type InviteCodesDialogType } from '../types'

type InviteCodesContextType = {
  open: InviteCodesDialogType | null
  setOpen: (str: InviteCodesDialogType | null) => void
  currentRow: InviteCode | null
  setCurrentRow: React.Dispatch<React.SetStateAction<InviteCode | null>>
  refreshTrigger: number
  triggerRefresh: () => void
}

const InviteCodesContext = React.createContext<InviteCodesContextType | null>(
  null
)

export function InviteCodesProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [open, setOpen] = useDialogState<InviteCodesDialogType>(null)
  const [currentRow, setCurrentRow] = useState<InviteCode | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const triggerRefresh = () => setRefreshTrigger((prev) => prev + 1)

  return (
    <InviteCodesContext
      value={{
        open,
        setOpen,
        currentRow,
        setCurrentRow,
        refreshTrigger,
        triggerRefresh,
      }}
    >
      {children}
    </InviteCodesContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useInviteCodes = () => {
  const inviteCodesContext = React.useContext(InviteCodesContext)

  if (!inviteCodesContext) {
    throw new Error(
      'useInviteCodes has to be used within <InviteCodesProvider>'
    )
  }

  return inviteCodesContext
}
