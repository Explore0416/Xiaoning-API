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
import { api, type ApiRequestConfig } from '@/lib/api'

import { buildQueryParams } from './lib/query-params'
import { parseTaskArtifactsResponse } from './lib/task-artifacts'
import type {
  GetLogsParams,
  GetLogsResponse,
  GetLogStatsParams,
  GetLogStatsResponse,
  GetMidjourneyLogsParams,
  GetTaskLogsParams,
  TaskArtifactsResponse,
  UserInfo,
} from './types'

// ============================================================================
// Generic API Helpers
// ============================================================================

function selfPath(endpoint: string): string {
  return `${endpoint.replace(/\/+$/, '')}/self`
}

async function fetchLogs<T>(
  path: string,
  params: T
): Promise<GetLogsResponse> {
  const paramRecord = params as unknown as Record<string, unknown>
  const queryParams = buildQueryParams({
    p: paramRecord.p || 1,
    page_size: paramRecord.page_size || 20,
    ...params,
  })
  const res = await api.get(`${path}?${queryParams}`)
  return res.data
}

async function fetchLogStats<T>(
  path: string,
  params: T
): Promise<GetLogStatsResponse> {
  const queryParams = buildQueryParams(
    params as unknown as Record<string, unknown>
  )
  const res = await api.get(`${path}?${queryParams}`)
  return res.data
}

// ============================================================================
// Common Log APIs
// ============================================================================

export const getAllLogs = (params: GetLogsParams = {}) =>
  fetchLogs('/api/log/', params)

export const getUserLogs = (
  params: Omit<GetLogsParams, 'username' | 'channel'> = {}
) => fetchLogs(selfPath('/api/log'), params)

export const getLogStats = (params: GetLogStatsParams = {}) =>
  fetchLogStats('/api/log/stat', params)

export const getUserLogStats = (
  params: Omit<GetLogStatsParams, 'username' | 'channel'> = {}
) => fetchLogStats(`${selfPath('/api/log')}/stat`, params)

export async function getUserInfo(
  userId: number
): Promise<{ success: boolean; message?: string; data?: UserInfo }> {
  const res = await api.get(`/api/user/${userId}`)
  return res.data
}

// ============================================================================
// MjProxy (Drawing) Logs API
// ============================================================================

export const getAllMidjourneyLogs = (params: GetMidjourneyLogsParams) =>
  fetchLogs('/api/mj/', params)

export const getUserMidjourneyLogs = (params: GetMidjourneyLogsParams) =>
  fetchLogs(selfPath('/api/mj'), params)

// ============================================================================
// Task Logs API
// ============================================================================

export const getAllTaskLogs = (params: GetTaskLogsParams) =>
  fetchLogs('/api/task', params)

export const getUserTaskLogs = (params: GetTaskLogsParams) =>
  fetchLogs(selfPath('/api/task'), params)

const taskArtifactRequestConfig = {
  skipBusinessError: true,
  skipErrorHandler: true,
} satisfies ApiRequestConfig

export async function getTaskArtifacts(taskId: string) {
  const response = await api.get<TaskArtifactsResponse>(
    `/api/task/${encodeURIComponent(taskId)}/artifacts`,
    taskArtifactRequestConfig
  )
  return parseTaskArtifactsResponse(response.data)
}
