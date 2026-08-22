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
import { z } from 'zod'

// ============================================================================
// Invite Code Schema & Types
// ============================================================================

export const inviteCodeSchema = z.object({
  id: z.number(),
  code: z.string(),
  created_by_user_id: z.number(),
  quota: z.number(),
  status: z.number(), // 1: enabled, 2: disabled, 3: exhausted
  max_use_count: z.number(),
  used_count: z.number(),
  expired_time: z.number(),
  created_time: z.number(),
})

export type InviteCode = z.infer<typeof inviteCodeSchema>

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface ApiResponse<T = unknown> {
  success: boolean
  message?: string
  data?: T
}

export interface GetInviteCodesParams {
  p?: number
  page_size?: number
}

export interface GetInviteCodesResponse {
  success: boolean
  message?: string
  data?: InviteCode[]
  total?: number
}

export interface SearchInviteCodesParams {
  keyword?: string
  status?: string
  p?: number
  page_size?: number
}

export interface InviteCodeFormData {
  count: number
  quota: number
  max_use_count?: number
  expired_time?: number
}

// ============================================================================
// Dialog Types
// ============================================================================

export type InviteCodesDialogType = 'create' | 'delete'
