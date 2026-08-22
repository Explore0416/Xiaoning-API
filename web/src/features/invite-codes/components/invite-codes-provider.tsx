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
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'

import { getInviteCodes, searchInviteCodes } from '../api'
import type { InviteCode, InviteCodesDialogType } from '../types'

interface InviteCodesContextValue {
  codes: InviteCode[]
  total: number
  isLoading: boolean
  page: number
  pageSize: number
  keyword: string
  statusFilter: string
  setPage: (page: number) => void
  setPageSize: (size: number) => void
  setKeyword: (keyword: string) => void
  setStatusFilter: (status: string) => void
  refresh: () => void
  dialog: InviteCodesDialogType | null
  dialogData: InviteCode | null
  openDialog: (type: InviteCodesDialogType, data?: InviteCode) => void
  closeDialog: () => void
}

const InviteCodesContext = createContext<InviteCodesContextValue | null>(null)

export function useInviteCodes() {
  const ctx = useContext(InviteCodesContext)
  if (!ctx) throw new Error('useInviteCodes must be used within InviteCodesProvider')
  return ctx
}

interface InviteCodesProviderProps {
  children: ReactNode
}

export function InviteCodesProvider({ children }: InviteCodesProviderProps) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dialog, setDialog] = useState<InviteCodesDialogType | null>(null)
  const [dialogData, setDialogData] = useState<InviteCode | null>(null)

  const queryKey = useMemo(
    () => ['invite-codes', page, pageSize, keyword, statusFilter],
    [page, pageSize, keyword, statusFilter]
  )

  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: () =>
      keyword || statusFilter
        ? searchInviteCodes({ keyword, status: statusFilter, p: page, page_size: pageSize })
        : getInviteCodes({ p: page, page_size: pageSize }),
  })

  const codes = data?.data ?? []
  const total = data?.total ?? 0

  const value = useMemo(
    () => ({
      codes,
      total,
      isLoading,
      page,
      pageSize,
      keyword,
      statusFilter,
      setPage,
      setPageSize,
      setKeyword,
      setStatusFilter,
      refresh: () => refetch(),
      dialog,
      dialogData,
      openDialog: (type: InviteCodesDialogType, data?: InviteCode) => {
        setDialog(type)
        setDialogData(data ?? null)
      },
      closeDialog: () => {
        setDialog(null)
        setDialogData(null)
      },
    }),
    [codes, total, isLoading, page, pageSize, keyword, statusFilter, dialog, dialogData, refetch]
  )

  return (
    <InviteCodesContext.Provider value={value}>
      {children}
    </InviteCodesContext.Provider>
  )
}

import { useState } from 'react'
