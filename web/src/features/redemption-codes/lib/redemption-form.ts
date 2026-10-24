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
  getRedemptionFormErrorMessages,
} from '../constants'
import type { RedemptionFormData, Redemption } from '../types'

// ============================================================================
// Form Schema (use getRedemptionFormSchema(t) in components for i18n messages)
// ============================================================================

export const REDEMPTION_TYPE_QUOTA = 'quota'
export const REDEMPTION_TYPE_RESET_CARD = 'reset_card'

export type RedemptionType =
  | typeof REDEMPTION_TYPE_QUOTA
  | typeof REDEMPTION_TYPE_RESET_CARD

export function getRedemptionFormSchema(t: TFunction) {
  const msg = getRedemptionFormErrorMessages(t)
  return z.object({
    type: z.enum([REDEMPTION_TYPE_QUOTA, REDEMPTION_TYPE_RESET_CARD]),
    name: z
      .string()
      .min(REDEMPTION_VALIDATION.NAME_MIN_LENGTH, msg.NAME_LENGTH_INVALID)
      .max(REDEMPTION_VALIDATION.NAME_MAX_LENGTH, msg.NAME_LENGTH_INVALID),
    quota_dollars: z.number().min(0, t('Quota must be a positive number')),
    reset_card_count: z.number().min(1).max(1000).optional(),
    expired_time: z.date().optional(),
    count: z
      .number()
      .min(REDEMPTION_VALIDATION.COUNT_MIN, msg.COUNT_INVALID)
      .max(REDEMPTION_VALIDATION.COUNT_MAX, msg.COUNT_INVALID)
      .optional(),
  })
}

export type RedemptionFormValues = {
  type: RedemptionType
  name: string
  quota_dollars: number
  reset_card_count?: number
  expired_time?: Date
  count?: number
}

// ============================================================================
// Form Defaults
// ============================================================================

export const REDEMPTION_FORM_DEFAULT_VALUES: RedemptionFormValues = {
  type: REDEMPTION_TYPE_QUOTA,
  name: '',
  quota_dollars: 10,
  reset_card_count: 1,
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
  data: RedemptionFormValues
): RedemptionFormData {
  return {
    name: data.name,
    type: data.type,
    quota:
      data.type === REDEMPTION_TYPE_RESET_CARD
        ? data.reset_card_count || 1
        : parseQuotaFromDollars(data.quota_dollars),
    expired_time: data.expired_time
      ? Math.floor(data.expired_time.getTime() / 1000)
      : 0,
    count: data.count || 1,
  }
}

/**
 * Transform redemption data to form defaults
 */
export function transformRedemptionToFormDefaults(
  redemption: Redemption
): RedemptionFormValues {
  const type =
    redemption.type === REDEMPTION_TYPE_RESET_CARD
      ? REDEMPTION_TYPE_RESET_CARD
      : REDEMPTION_TYPE_QUOTA
  return {
    type,
    name: redemption.name,
    quota_dollars:
      type === REDEMPTION_TYPE_RESET_CARD
        ? 10
        : quotaUnitsToEditableAmount(redemption.quota),
    reset_card_count:
      type === REDEMPTION_TYPE_RESET_CARD ? redemption.quota : 1,
    expired_time:
      redemption.expired_time > 0
        ? new Date(redemption.expired_time * 1000)
        : undefined,
    count: 1,
  }
}
