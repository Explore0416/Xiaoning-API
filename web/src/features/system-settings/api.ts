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
  ConfirmPaymentComplianceResponse,
  FetchUpstreamRatiosRequest,
  LogCleanupTask,
  SystemOptionsResponse,
  SystemTaskListResponse,
  SystemTaskResponse,
  UpdateOptionRequest,
  UpdateOptionResponse,
  UpstreamChannelsResponse,
  UpstreamRatiosResponse,
} from './types'

export async function getSystemOptions() {
  const res = await api.get<SystemOptionsResponse>('/api/option/')
  return res.data
}

export async function updateSystemOption(request: UpdateOptionRequest) {
  const res = await api.put<UpdateOptionResponse>('/api/option/', request)
  return res.data
}

export async function confirmPaymentCompliance() {
  const res = await api.post<ConfirmPaymentComplianceResponse>(
    '/api/option/payment_compliance',
    { confirmed: true }
  )
  return res.data
}

export async function startLogCleanupTask(targetTimestamp: number) {
  const res = await api.post<SystemTaskResponse<LogCleanupTask>>(
    '/api/system-task/log-cleanup',
    null,
    {
      params: { target_timestamp: targetTimestamp },
    }
  )
  return res.data
}

export async function getCurrentLogCleanupTask() {
  const res = await api.get<SystemTaskResponse<LogCleanupTask | null>>(
    '/api/system-task/current',
    {
      params: { type: 'log_cleanup' },
    }
  )
  return res.data
}

export async function getSystemTask(taskId: string) {
  const res = await api.get<SystemTaskResponse<LogCleanupTask>>(
    `/api/system-task/${taskId}`
  )
  return res.data
}

export async function listSystemTasks(limit = 20) {
  const res = await api.get<SystemTaskListResponse>('/api/system-task/list', {
    params: { limit },
  })
  return res.data
}

export async function resetModelRatios() {
  const res = await api.post<UpdateOptionResponse>(
    '/api/option/rest_model_ratio'
  )
  return res.data
}

export async function getUpstreamChannels() {
  const res = await api.get<UpstreamChannelsResponse>(
    '/api/ratio_sync/channels'
  )
  return res.data
}

export async function fetchUpstreamRatios(request: FetchUpstreamRatiosRequest) {
  const res = await api.post<UpstreamRatiosResponse>(
    '/api/ratio_sync/fetch',
    request
  )
  return res.data
}

export type RatioBatchRule = {
  field:
    | 'model_ratio'
    | 'completion_ratio'
    | 'cache_ratio'
    | 'create_cache_ratio'
    | 'image_ratio'
    | 'audio_ratio'
    | 'audio_completion_ratio'
    | 'model_price'
  match: { type: 'prefix' | 'suffix' | 'contains' | 'exact' | 'regex'; pattern: string }
  op: { type: 'multiply' | 'set' | 'add'; value: number }
}

export type PricingModelInventoryItem = {
  model_name: string
  sources: string[]
  metadata?: {
    id: number
    model_name: string
    description?: string
    tags?: string
    vendor_id?: number
    status: number
    sync_official: number
    name_rule: number
  }
  pricing: {
    model_ratio?: number
    completion_ratio?: number
    cache_ratio?: number
    create_cache_ratio?: number
    image_ratio?: number
    audio_ratio?: number
    audio_completion_ratio?: number
    model_price?: number
  }
  channels: Array<{ name: string; type: number }>
}

type PricingModelInventoryResponse = {
  success: boolean
  message?: string
  data?: PricingModelInventoryItem[]
}

type BatchModelResponse = {
  success: boolean
  message?: string
  data?: Record<string, unknown>
}

type RatioBatchResponse = {
  success: boolean
  message?: string
  data?: {
    changes: Array<{ field: string; model: string; old: number; new: number }>
    errors: Array<{ field?: string; model?: string; message: string }>
    affected_count: number
  }
}

export async function previewRatioBatch(
  rules: RatioBatchRule[],
  targetModels?: string[]
) {
  const res = await api.post<RatioBatchResponse>('/api/ratio_batch/preview', {
    rules,
    target_models: targetModels,
  })
  return res.data
}

export async function applyRatioBatch(
  rules: RatioBatchRule[],
  targetModels?: string[]
) {
  const res = await api.post<RatioBatchResponse>('/api/ratio_batch/apply', {
    rules,
    target_models: targetModels,
  })
  return res.data
}

export async function getPricingModelInventory() {
  const res = await api.get<PricingModelInventoryResponse>('/api/ratio_batch/models')
  return res.data
}

export async function batchCreatePricingModels(
  models: Array<Record<string, unknown>>
) {
  const res = await api.post<BatchModelResponse>('/api/models/batch', { models })
  return res.data
}

export async function batchUpdatePricingModels(
  ids: number[],
  patch: Record<string, unknown>
) {
  const res = await api.put<BatchModelResponse>('/api/models/batch', { ids, patch })
  return res.data
}

export async function batchDeletePricingModels(ids: number[]) {
  const res = await api.delete<BatchModelResponse>('/api/models/batch', {
    data: { ids },
  })
  return res.data
}
