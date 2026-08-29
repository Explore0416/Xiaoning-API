import { api } from '@/lib/api'

export type ChannelProbeHistory = {
  success: boolean
  latency_ms: number
  probed_at: number
  status_code: number
  error_code: string
}

export type ChannelMonitoringModel = {
  model_name: string
  request_count: number
  success_count: number
  availability: number
  average_latency: number
  available?: boolean
  last_probe_at?: number
  history?: ChannelProbeHistory[]
  error_code?: string
}

export type ChannelMonitoringItem = {
  channel_id: number
  channel_name: string
  channel_type: number
  channel_status: number
  response_time: number
  test_time: number
  model_count: number
  request_count: number
  success_count: number
  availability: number
  average_latency: number
  last_probe_at?: number
  data_source?: 'active_probe'
  recent: boolean[]
  models: ChannelMonitoringModel[]
}

export type ModelMonitoringResponse = {
  success: boolean
  message?: string
  data?: ChannelMonitoringItem[]
}

export async function getModelMonitoring(days: 7 | 15 | 30) {
  const res = await api.get<ModelMonitoringResponse>(
    '/api/channel/model-monitoring',
    { params: { days } }
  )
  return res.data
}
