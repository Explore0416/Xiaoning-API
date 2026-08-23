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
import type { TFunction } from 'i18next'
import { z } from 'zod'

import {
  parseQuotaFromDollars,
} from '@/lib/format'

import {
  REDEMPTION_VALIDATION,
  getInviteCodeFormErrorMessages,
} from '../constants'
import type { InviteCodeFormData } from '../types'

// ============================================================================
// Form Schema (use getInviteCodeFormSchema(t) in components for i18n messages)
// ============================================================================

export function getInviteCodeFormSchema(t: TFunction) {
  const msg = getInviteCodeFormErrorMessages(t)
  return z.object({
    count: z
      .number()
      .min(REDEMPTION_VALIDATION.COUNT_MIN, msg.COUNT_INVALID)
      .max(REDEMPTION_VALIDATION.COUNT_MAX, msg.COUNT_INVALID),
    quota_dollars: z.number().min(0, t('Quota must be a positive number')),
    max_use_count: z
      .number()
      .min(0, t('Max uses must be a non-negative number')),
    expired_time: z.date().optional(),
  })
}

export type InviteCodeFormValues = {
  count: number
  quota_dollars: number
  max_use_count: number
  expired_time?: Date
}

// ============================================================================
// Form Defaults
// ============================================================================

export const INVITE_CODE_FORM_DEFAULT_VALUES: InviteCodeFormValues = {
  count: 1,
  quota_dollars: 10,
  max_use_count: 1,
  expired_time: undefined,
}

// ============================================================================
// Form Data Transformation
// ============================================================================

/**
 * Transform form data to API payload
 */
export function transformFormDataToPayload(
  data: InviteCodeFormValues
): InviteCodeFormData {
  return {
    count: data.count || 1,
    quota: parseQuotaFromDollars(data.quota_dollars),
    max_use_count: data.max_use_count || 0,
    expired_time: data.expired_time
      ? Math.floor(data.expired_time.getTime() / 1000)
      : 0,
  }
}

/**
 * Transform inviteCode data to form defaults
 */
