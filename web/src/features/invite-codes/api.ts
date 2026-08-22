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
import { api } from '@/lib/api'

import type {
  InviteCode,
  ApiResponse,
  GetInviteCodesParams,
  GetInviteCodesResponse,
  SearchInviteCodesParams,
  InviteCodeFormData,
} from './types'

// ============================================================================
// Invite Code Management
// ============================================================================

export async function getInviteCodes(
  params: GetInviteCodesParams = {}
): Promise<GetInviteCodesResponse> {
  const { p = 1, page_size = 10 } = params
  const res = await api.get(`/api/invite_code/?p=${p}&page_size=${page_size}`)
  return res.data
}

export async function searchInviteCodes(
  params: SearchInviteCodesParams
): Promise<GetInviteCodesResponse> {
  const { keyword = '', status = '', p = 1, page_size = 10 } = params
  const queryParams = new URLSearchParams()
  queryParams.set('keyword', keyword)
  if (status) queryParams.set('status', status)
  queryParams.set('p', String(p))
  queryParams.set('page_size', String(page_size))
  const res = await api.get(`/api/invite_code/search?${queryParams.toString()}`)
  return res.data
}

export async function generateInviteCodes(
  data: InviteCodeFormData
): Promise<ApiResponse<string[]>> {
  const res = await api.post('/api/invite_code/', data)
  return res.data
}

export async function deleteInviteCode(id: number): Promise<ApiResponse> {
  const res = await api.delete(`/api/invite_code/${id}/`)
  return res.data
}

export async function deleteExpiredInviteCodes(): Promise<ApiResponse<number>> {
  const res = await api.delete('/api/invite_code/invalid')
  return res.data
}
