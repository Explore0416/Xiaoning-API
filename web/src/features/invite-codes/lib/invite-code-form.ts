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
  quotaUnitsToEditableAmount,
} from '@/lib/format'

import {
  REDEMPTION_VALIDATION,
  getInviteCodeFormErrorMessages,
} from '../constants'
import type { InviteCodeFormData, InviteCode } from '../types'

// ============================================================================
// Form Schema (use getInviteCodeFormSchema(t) in components for i18n messages)
// ============================================================================

export function getInviteCodeFormSchema(t: TFunction) {
  const msg = getInviteCodeFormErrorMessages(t)
  return z.object({
    name: z
      .string()
      .min(REDEMPTION_VALIDATION.NAME_MIN_LENGTH, msg.NAME_LENGTH_INVALID)
      .max(REDEMPTION_VALIDATION.NAME_MAX_LENGTH, msg.NAME_LENGTH_INVALID),
    quota_dollars: z.number().min(0, t('Quota must be a positive number')),
    expired_time: z.date().optional(),
    count: z
      .number()
      .min(REDEMPTION_VALIDATION.COUNT_MIN, msg.COUNT_INVALID)
      .max(REDEMPTION_VALIDATION.COUNT_MAX, msg.COUNT_INVALID)
      .optional(),
  })
}

export type InviteCodeFormValues = {
  name: string
  quota_dollars: number
  expired_time?: Date
  count?: number
}

// ============================================================================
// Form Defaults
// ============================================================================

export const INVITE_CODE_FORM_DEFAULT_VALUES: InviteCodeFormValues = {
  name: '',
  quota_dollars: 10,
  expired_time: undefined,
  count: 1,
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
    name: data.name,
    quota: parseQuotaFromDollars(data.quota_dollars),
    expired_time: data.expired_time
      ? Math.floor(data.expired_time.getTime() / 1000)
      : 0,
    count: data.count || 1,
  }
}

/**
 * Transform inviteCode data to form defaults
 */
export function transformInviteCodeToFormDefaults(
  inviteCode: InviteCode
): InviteCodeFormValues {
  return {
    name: inviteCode.name,
    quota_dollars: quotaUnitsToEditableAmount(inviteCode.quota),
    expired_time:
      inviteCode.expired_time > 0
        ? new Date(inviteCode.expired_time * 1000)
        : undefined,
    count: 1,
  }
}
