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
// InviteCode Code Management
// ============================================================================

// Get paginated inviteCode codes list
export async function getInviteCodes(
  params: GetInviteCodesParams = {}
): Promise<GetInviteCodesResponse> {
  const { p = 1, page_size = 10 } = params
  const res = await api.get(`/api/invite_code/?p=${p}&page_size=${page_size}`)
  return res.data
}

// Search inviteCode codes by keyword
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

// Get single inviteCode code by ID
export async function getInviteCode(
  id: number
): Promise<ApiResponse<InviteCode>> {
  const res = await api.get(`/api/invite_code/${id}`)
  return res.data
}

// Create inviteCode code(s)
export async function createInviteCode(
  data: InviteCodeFormData
): Promise<ApiResponse<string[]>> {
  const res = await api.post('/api/invite_code/', data)
  return res.data
}

// Update inviteCode code
export async function updateInviteCode(
  data: InviteCodeFormData & { id: number }
): Promise<ApiResponse<InviteCode>> {
  const res = await api.put('/api/invite_code/', data)
  return res.data
}

// Update inviteCode code status (enable/disable)
export async function updateInviteCodeStatus(
  id: number,
  status: number
): Promise<ApiResponse<InviteCode>> {
  const res = await api.put('/api/invite_code/?status_only=true', { id, status })
  return res.data
}

// Delete a single inviteCode code
export async function deleteInviteCode(id: number): Promise<ApiResponse> {
  const res = await api.delete(`/api/invite_code/${id}/`)
  return res.data
}

// Delete invalid inviteCode codes (used, disabled, expired)
export async function deleteInvalidInviteCodes(): Promise<ApiResponse<number>> {
  const res = await api.delete('/api/invite_code/invalid')
  return res.data
}
